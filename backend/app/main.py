import json
import io
import os
import chromadb

from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Depends, Form, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from sse_starlette.sse import EventSourceResponse
from PyPDF2 import PdfReader
from sqlmodel import Session, select
from typing import Optional
from pydantic import BaseModel
from datetime import timedelta, datetime, timezone

from app.auth import get_password_hash, verify_password, create_access_token, get_current_user, ACCESS_TOKEN_EXPIRE_MINUTES
from app.db import create_db_and_tables, get_session, User, Project, Folder, Document, Message, engine
from app.agents.router import router_agent

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_collection = chroma_client.get_or_create_collection(name="cogito_documents")

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200):
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserCreate(BaseModel):
    email: str
    password: str
    username: str  

class Token(BaseModel):
    access_token: str
    token_type: str

class ChatRequest(BaseModel):
    message: str
    project_id: int

class ProjectUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class NotesUpdateRequest(BaseModel):
    notes: str

class FolderCreateRequest(BaseModel):
    name: str

class UserUpdate(BaseModel):
    username: str

class PasswordUpdate(BaseModel):
    current_password: str
    new_password: str

class FolderRenameRequest(BaseModel):
    name: str

class DocumentMoveRequest(BaseModel):
    folder_id: Optional[int] = None

class FolderMoveRequest(BaseModel):
    parent_id: Optional[int] = None

@app.post("/api/auth/register")
def register_user(user_data: UserCreate, db: Session = Depends(get_session)):
    existing_email = db.exec(select(User).where(User.email == user_data.email)).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="Email already registered")
        
    existing_username = db.exec(select(User).where(User.username == user_data.username)).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already taken")

    hashed_pw = get_password_hash(user_data.password)
    
    new_user = User(
        email=user_data.email, 
        username=user_data.username, 
        hashed_password=hashed_pw
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    access_token = create_access_token(data={"sub": new_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=Token)
def login_user(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_session)):
    user = db.exec(select(User).where(User.email == form_data.username)).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=access_token_expires)
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/users/me")
def get_user_profile(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "username": current_user.username,
        "avatar_url": f"https://api.dicebear.com/7.x/initials/svg?seed={current_user.username}&backgroundColor=2563eb"
    }

@app.patch("/api/users/me")
def update_user_profile(request: UserUpdate, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    existing = db.exec(select(User).where(User.username == request.username)).first()
    if existing and existing.id != current_user.id:
        raise HTTPException(status_code=400, detail="Username already taken")
        
    current_user.username = request.username
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return {"success": True, "username": current_user.username}

@app.patch("/api/users/me/password")
def update_user_password(request: PasswordUpdate, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    if not verify_password(request.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")
        
    current_user.hashed_password = get_password_hash(request.new_password)
    db.add(current_user)
    db.commit()
    return {"success": True}

@app.delete("/api/users/me")
def delete_user_account(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    try:
        projects = db.exec(select(Project).where(Project.user_id == current_user.id)).all()
        for proj in projects:
            vector_collection.delete(where={"project_id": proj.id})
            
            documents = db.exec(select(Document).where(Document.project_id == proj.id)).all()
            for doc in documents:
                file_path = os.path.join(UPLOAD_DIR, f"proj_{proj.id}_{doc.filename}")
                if os.path.exists(file_path):
                    os.remove(file_path)
                    
        db.delete(current_user)
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/projects")
def create_project(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    new_project = Project(title="New Research Project", user_id=current_user.id)
    db.add(new_project)
    db.commit()
    db.refresh(new_project)

    default_folders = ["Literature Review", "Datasets", "Drafts"]
    for folder_name in default_folders:
        new_folder = Folder(name=folder_name, project_id=new_project.id)
        db.add(new_folder)
    
    db.commit()

    db.refresh(new_project)

    return new_project

@app.get("/api/projects")
def get_all_projects(db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.exec(select(Project).where(Project.user_id == current_user.id).order_by(Project.created_at.desc())).all()

@app.patch("/api/projects/{project_id}")
def update_project(
    project_id: int, 
    request: ProjectUpdateRequest, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if request.title is not None:
        project.title = request.title
    if request.description is not None:
        project.description = request.description
        
    project.updated_at = datetime.now(timezone.utc)
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

@app.patch("/api/projects/{project_id}/notes")
def update_project_notes(project_id: int, request: NotesUpdateRequest, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    
    project.notes = request.notes
    db.add(project)
    db.commit()
    return {"success": True}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        vector_collection.delete(where={"project_id": project_id})
        documents = db.exec(select(Document).where(Document.project_id == project_id)).all()
        for doc in documents:
            file_path = os.path.join(UPLOAD_DIR, f"proj_{project_id}_{doc.filename}")
            if os.path.exists(file_path):
                os.remove(file_path)
            
        db.delete(project)
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback() 
        return {"success": False, "error": str(e)}

@app.post("/api/projects/{project_id}/folders")
def create_folder(project_id: int, request: FolderCreateRequest, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
        
    new_folder = Folder(name=request.name, project_id=project_id)
    db.add(new_folder)
    db.commit()
    db.refresh(new_folder)
    return new_folder

@app.get("/api/projects/{project_id}/folders")
def get_folders(project_id: int, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    return db.exec(select(Folder).where(Folder.project_id == project_id)).all()

@app.patch("/api/projects/{project_id}/folders/{folder_id}")
def rename_folder(project_id: int, folder_id: int, request: FolderRenameRequest, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    folder = db.get(Folder, folder_id)
    if not folder or folder.project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    folder.name = request.name
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

@app.patch("/api/projects/{project_id}/folders/{folder_id}/move")
def move_folder(
    project_id: int, 
    folder_id: int, 
    request: FolderMoveRequest, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    folder = db.get(Folder, folder_id)
    if not folder or folder.project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
        
    if folder_id == request.parent_id:
        raise HTTPException(status_code=400, detail="Cannot move a folder into itself")
        
    folder.parent_id = request.parent_id
    db.add(folder)
    db.commit()
    return {"success": True}

@app.delete("/api/projects/{project_id}/folders/{folder_id}")
def delete_folder(project_id: int, folder_id: int, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    folder = db.get(Folder, folder_id)
    if not folder or folder.project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Folder not found")
    
    docs = db.exec(select(Document).where(Document.folder_id == folder_id)).all()
    for doc in docs:
        doc.folder_id = None
        db.add(doc)
        
    db.delete(folder)
    db.commit()
    return {"success": True}

@app.post("/api/projects/{project_id}/upload")
async def upload_pdf(project_id: int, file: UploadFile = File(...), folder_id: Optional[int] = Form(None), db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    try:
        file_content = await file.read()
        safe_filename = file.filename.replace(" ", "_")
        unique_file_id = f"proj_{project_id}_{safe_filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_file_id)
        
        with open(file_path, "wb") as f:
            f.write(file_content)

        pdf = PdfReader(io.BytesIO(file_content))
        text = "".join([page.extract_text() or "" for page in pdf.pages])
                
        doc = Document(project_id=project_id, folder_id=folder_id, filename=safe_filename, content=text, source="local")
        db.add(doc)
        db.commit()
        db.refresh(doc)

        chunks = chunk_text(text)
        chunk_ids = [f"doc_proj_{project_id}_{safe_filename}_{i}" for i in range(len(chunks))]
        metadatas = [{"project_id": project_id, "user_id": current_user.id, "filename": safe_filename} for _ in chunks]
        
        vector_collection.add(documents=chunks, metadatas=metadatas, ids=chunk_ids)
        
        return {"success": True, "filename": safe_filename, "id": doc.id}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/projects/{project_id}/documents")
def get_documents(project_id: int, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Not authorized")
    return db.exec(select(Document).where(Document.project_id == project_id)).all()

@app.get("/api/projects/{project_id}/pdf/{filename}")
def serve_pdf(project_id: int, filename: str, current_user: User = Depends(get_current_user)):
    file_path = os.path.join(UPLOAD_DIR, f"proj_{project_id}_{filename}")
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="PDF file not found")

@app.patch("/api/projects/{project_id}/documents/{document_id}/move")
def move_document(
    project_id: int, 
    document_id: int, 
    request: DocumentMoveRequest, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
        
    doc = db.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")
        
    doc.folder_id = request.folder_id
    db.add(doc)
    db.commit()
    return {"success": True}

@app.delete("/api/projects/{project_id}/documents/{document_id}")
def delete_document(
    project_id: int, 
    document_id: int, 
    db: Session = Depends(get_session), 
    current_user: User = Depends(get_current_user)
):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    doc = db.get(Document, document_id)
    if not doc or doc.project_id != project_id:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        vector_collection.delete(
            where={
                "$and": [
                    {"filename": {"$eq": doc.filename}},
                    {"project_id": {"$eq": project_id}}
                ]
            }
        )
        
        file_path = os.path.join(UPLOAD_DIR, f"proj_{project_id}_{doc.filename}")
        if os.path.exists(file_path):
            os.remove(file_path)
            
        db.delete(doc)
        db.commit()
        return {"success": True}
        
    except Exception as e:
        db.rollback()
        print(f"DELETION ERROR: {str(e)}") 
        raise HTTPException(status_code=500, detail=f"Internal Server Error: {str(e)}")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, request.project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")

    user_msg = Message(project_id=request.project_id, role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    async def event_generator():
        try:
            assistant_content = ""
            async for event in router_agent.run_stream_events(request.message, deps=request.project_id):
                from pydantic_ai.messages import TextPartDelta, PartDeltaEvent, PartStartEvent
                
                if isinstance(event, PartDeltaEvent):
                    if isinstance(event.delta, TextPartDelta):
                        assistant_content += event.delta.content_delta
                        yield {"data": json.dumps({"type": "text", "data": event.delta.content_delta})}
                elif isinstance(event, PartStartEvent):
                    if hasattr(event.part, 'tool_name'):
                        yield {"data": json.dumps({"type": "status", "data": f"Cogito using {event.part.tool_name}..."})}

            if assistant_content:
                with Session(engine) as stream_db:
                    ai_msg = Message(project_id=request.project_id, role="synthesizer", content=assistant_content)
                    stream_db.add(ai_msg)
                    stream_db.commit()
        except Exception as e:
            yield {"data": json.dumps({"type": "text", "data": f"\n**Error:** {str(e)}"})}

    return EventSourceResponse(event_generator())

@app.get("/api/projects/{project_id}/messages")
def get_project_messages(project_id: int, db: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    project = db.get(Project, project_id)
    if not project or project.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Project not found")
    return db.exec(select(Message).where(Message.project_id == project_id).order_by(Message.created_at.asc())).all()
