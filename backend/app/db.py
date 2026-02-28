from typing import Optional, List
from datetime import datetime, timezone
from sqlmodel import SQLModel, Field, Relationship, create_engine, Session

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    username: str = Field(unique=True, index=True) 
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    projects: list["Project"] = Relationship(back_populates="user", cascade_delete=True)

class Project(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    title: str = Field(default="New Research Project")
    description: str = Field(default="")
    notes: str = Field(default="# Research Notes\n\nStart drafting your paper here...")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    user: Optional[User] = Relationship(back_populates="projects")
    folders: List["Folder"] = Relationship(back_populates="project", cascade_delete=True)
    documents: List["Document"] = Relationship(back_populates="project", cascade_delete=True)
    messages: List["Message"] = Relationship(back_populates="project", cascade_delete=True)

class Folder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    parent_id: Optional[int] = Field(default=None, foreign_key="folder.id")
    name: str = Field(default="New Folder")
    
    project: Optional["Project"] = Relationship(back_populates="folders")
    documents: List["Document"] = Relationship(back_populates="folder")

class Document(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    folder_id: Optional[int] = Field(default=None, foreign_key="folder.id")
    
    filename: str
    content: str
    source: str = Field(default="local") 
    external_id: Optional[str] = Field(default=None) 
    authors: Optional[str] = Field(default=None) 
    published_year: Optional[int] = Field(default=None)
    url: Optional[str] = Field(default=None)
    
    project: Optional[Project] = Relationship(back_populates="documents")
    folder: Optional[Folder] = Relationship(back_populates="documents")

class Message(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="project.id")
    role: str 
    content: str
    
    project: Optional[Project] = Relationship(back_populates="messages")

sqlite_file_name = "deepcite_os.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"

engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def create_db_and_tables():
    SQLModel.metadata.create_all(engine)

def get_session():
    with Session(engine) as session:
        yield session