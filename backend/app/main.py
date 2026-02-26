import json
import io
import os
import chromadb
from contextlib import asynccontextmanager
from fastapi import FastAPI, UploadFile, File, Depends, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from PyPDF2 import PdfReader
from sqlmodel import Session, select
from typing import Optional, List

from app.agents.router import router_agent
from app.db import (
    create_db_and_tables, 
    get_session, 
    ChatSession, 
    Message, 
    Document, 
    engine
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_collection = chroma_client.get_or_create_collection(name="deepcite_documents")

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

class ChatRequest(BaseModel):
    message: str
    session_id: int

class RenameRequest(BaseModel):
    title: str

class NotesUpdateRequest(BaseModel):
    notes: str

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_session)):
    user_msg = Message(session_id=request.session_id, role="user", content=request.message)
    db.add(user_msg)
    db.commit()

    async def event_generator():
        try:
            assistant_content = ""
            async for event in router_agent.run_stream_events(request.message, deps=request.session_id):
                from pydantic_ai.messages import TextPartDelta, PartDeltaEvent, PartStartEvent
                
                if isinstance(event, PartDeltaEvent):
                    if isinstance(event.delta, TextPartDelta):
                        assistant_content += event.delta.content_delta
                        yield {"data": json.dumps({"type": "text", "data": event.delta.content_delta})}
                elif isinstance(event, PartStartEvent):
                    if hasattr(event.part, 'tool_name'):
                        yield {"data": json.dumps({"type": "status", "data": f"DeepCite using {event.part.tool_name}..."})}

            if assistant_content:
                with Session(engine) as stream_db:
                    ai_msg = Message(session_id=request.session_id, role="assistant", content=assistant_content)
                    stream_db.add(ai_msg)
                    stream_db.commit()
        except Exception as e:
            yield {"data": json.dumps({"type": "text", "data": f"\n**Error:** {str(e)}"})}

    return EventSourceResponse(event_generator())

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...), session_id: int = Form(...), db: Session = Depends(get_session)):
    try:
        file_content = await file.read()
        safe_filename = file.filename.replace(" ", "_")
        unique_file_id = f"{session_id}_{safe_filename}"
        file_path = os.path.join(UPLOAD_DIR, unique_file_id)
        
        with open(file_path, "wb") as f:
            f.write(file_content)

        pdf = PdfReader(io.BytesIO(file_content))
        text = "".join([page.extract_text() or "" for page in pdf.pages])
                
        doc = Document(session_id=session_id, filename=safe_filename, content=text)
        db.add(doc)
        db.commit()

        chunks = chunk_text(text)
        chunk_ids = [f"doc_{session_id}_{safe_filename}_{i}" for i in range(len(chunks))]
        metadatas = [{"session_id": session_id, "filename": safe_filename} for _ in chunks]
        
        vector_collection.add(documents=chunks, metadatas=metadatas, ids=chunk_ids)
        
        return {"success": True, "filename": safe_filename}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/sessions/{session_id}/documents")
def get_documents(session_id: int, db: Session = Depends(get_session)):
    docs = db.exec(select(Document).where(Document.session_id == session_id)).all()
    return [{"id": d.id, "filename": d.filename} for d in docs]

@app.get("/api/sessions/{session_id}/pdf/{filename}")
def serve_pdf(session_id: int, filename: str):
    file_path = os.path.join(UPLOAD_DIR, f"{session_id}_{filename}")
    if os.path.exists(file_path):
        return FileResponse(file_path, media_type="application/pdf")
    raise HTTPException(status_code=404, detail="PDF file not found")

@app.post("/api/sessions")
def create_session(db: Session = Depends(get_session)):
    new_session = ChatSession(title="New Research Session")
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

@app.get("/api/sessions")
def get_all_sessions(db: Session = Depends(get_session)):
    return db.exec(select(ChatSession).order_by(ChatSession.created_at.desc())).all()

@app.patch("/api/sessions/{session_id}/notes")
def update_session_notes(session_id: int, request: NotesUpdateRequest, db: Session = Depends(get_session)):
    """Auto-save route for the LaTeX/Markdown editor."""
    session = db.get(ChatSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.notes = request.notes
    db.add(session)
    db.commit()
    return {"success": True}

@app.patch("/api/sessions/{session_id}")
def rename_session(session_id: int, request: RenameRequest, db: Session = Depends(get_session)):
    session = db.get(ChatSession, session_id)
    if not session: return {"success": False, "error": "Not found"}
    session.title = request.title
    db.add(session)
    db.commit()
    return session

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_session)):
    try:
        vector_collection.delete(where={"session_id": session_id})
        db.exec(select(Message).where(Message.session_id == session_id)).all()
        [db.delete(m) for m in db.exec(select(Message).where(Message.session_id == session_id)).all()]
        docs = db.exec(select(Document).where(Document.session_id == session_id)).all()
        for doc in docs:
            path = os.path.join(UPLOAD_DIR, f"{session_id}_{doc.filename}")
            if os.path.exists(path): os.remove(path)
            db.delete(doc)
        sess = db.get(ChatSession, session_id)
        if sess: db.delete(sess)
        db.commit()
        return {"success": True}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}

@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: int, db: Session = Depends(get_session)):
    return db.exec(select(Message).where(Message.session_id == session_id).order_by(Message.created_at.asc())).all()