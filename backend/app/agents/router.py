import os
from dotenv import load_dotenv
import chromadb
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.litellm import LiteLLMProvider
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
from app.agents.critic import critic_agent, CriticDeps
from sqlmodel import Session
from app.db import engine, Project

load_dotenv()

chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_collection = chroma_client.get_or_create_collection(name="deepcite_vectors")

class RouterDeps(BaseModel):
    project_id: int
    file_context: str
    current_notes: str 

model = OpenAIChatModel(
    'gpt-oss-120b',
    provider=LiteLLMProvider(
        api_base='https://api.ai.it.ufl.edu',
        api_key=os.getenv('OPENAI_API_KEY')
    )
)

router_agent = Agent(
    model=model,
    tools=[duckduckgo_search_tool()],
    deps_type=RouterDeps,
    system_prompt=(
        "You are DeepCite, an academic research assistant. "
        "You have access to the live web via DuckDuckGo, and you can read uploaded PDF documents. "
        "CRITICAL INSTRUCTIONS:\n"
        "1. If the user asks about an uploaded document, use the 'read_uploaded_paper' tool FIRST.\n"
        "2. Before giving your final answer to the user about a document, use the 'peer_review_claim' tool to verify your findings with the Critic.\n"
        "3. Do not use the web search tool to open URLs.\n"
        "4. Always cite your sources clearly."
    )
)

@router_agent.system_prompt
def add_file_context(ctx: RunContext[RouterDeps]) -> str:
    """
    Inject file context into the router agent's system prompt.
    
    Args:
        ctx: RunContext containing file context information
    
    Returns:
        System prompt string with file context information
    """
    return (
        f"Here is the current state of the user's project library and folder structure:\n"
        f"{ctx.deps.file_context}\n\n"
        f"Use this to understand what files exist. When searching the knowledge base, use specific queries related to these files."
    )

@router_agent.tool
def read_uploaded_paper(ctx: RunContext[RouterDeps], query: str) -> str:
    """
    Searches the user's uploaded documents for the given query. 
    You MUST provide a highly specific search query. DO NOT pass an empty string.
    """
    print(f"\n[🤖 RAG TOOL] AI is searching for: '{query}' in Project {ctx.deps.project_id}")
    
    if not query or query.strip() == "":
        return "Error: You must provide a specific search query."

    try:
        total_docs = vector_collection.count()
        print(f"[🔎 DIAGNOSTIC] Total chunks currently sitting in ChromaDB: {total_docs}")

        results = vector_collection.query(
            query_texts=[query],
            n_results=5,
            where={"project_id": ctx.deps.project_id} 
        )
        
        num_found = len(results['documents'][0]) if results['documents'] else 0
        print(f"[📊 CHROMA RESULTS] Found {num_found} text chunks.")

        if not results['documents'] or not results['documents'][0]:
            return "No relevant information found in the uploaded documents for this project."
            
        formatted_results = "Here are the most relevant excerpts from the uploaded documents:\n\n"
        for i, doc_chunk in enumerate(results['documents'][0]):
            source_file = results['metadatas'][0][i].get('filename', 'Unknown File')
            formatted_results += f"--- Excerpt from {source_file} ---\n{doc_chunk}\n\n"
            
        return formatted_results
    except Exception as e:
        print(f"[❌ ERROR] ChromaDB Error: {str(e)}")
        return f"Error searching database: {str(e)}"
    
@router_agent.tool
def peer_review_claim(ctx: RunContext[RouterDeps], drafted_claim: str, source_excerpts: str) -> str:
    """
    Passes your drafted claim and the source excerpts to the Critic Agent for peer review.
    ALWAYS use this tool to ensure you are not hallucinating before you stream the final answer to the user.
    """
    print(f"\n[🧐 CRITIC ACTIVATED] Reviewing drafted claim...")
    
    deps = CriticDeps(source_excerpts=source_excerpts)
    
    try:
        result = critic_agent.run_sync(drafted_claim, deps=deps)
        
        if result.output.is_supported:
            print("[✅ CRITIC PASSED]")
            return "Critic approved. Your claim is factually supported by the text. Proceed with this answer."
        else:
            print(f"[❌ CRITIC FAILED] {result.output.feedback}")
            return f"Critic REJECTED the claim. Feedback: {result.output.feedback}. YOU MUST USE THIS CORRECTED VERSION INSTEAD: {result.output.corrected_draft}"
            
    except Exception as e:
        print(f"[⚠️ CRITIC ERROR] {str(e)}")
        return "Critic is unavailable. Proceed carefully and stick strictly to the text."
    
@router_agent.tool
def read_project_notes(ctx: RunContext[RouterDeps]) -> str:
    """
    Reads the current content of the user's Co-Author Editor notes.
    Use this if the user asks you to review what they have written so far.
    """
    with Session(engine) as db:
        project = db.get(Project, ctx.deps.project_id)
        if project and project.notes:
            return f"CURRENT NOTES:\n{project.notes}"
        return "The notes are currently empty."

@router_agent.tool
def append_to_notes(ctx: RunContext[RouterDeps], text_to_append: str) -> str:
    """
    Appends text directly to the user's Co-Author Editor.
    Use this tool when the user explicitly asks you to 'write this down', 'save this to my notes', or 'draft a section'.
    ALWAYS format the appended text cleanly in Markdown.
    """
    print(f"\n[✍️ EDITOR TOOL] Agent is writing to notes...")
    with Session(engine) as db:
        project = db.get(Project, ctx.deps.project_id)
        if project:
            current_notes = project.notes or ""
            project.notes = current_notes + "\n\n" + text_to_append if current_notes else text_to_append
            db.commit()
            return "Successfully appended the text to the user's notes."
        return "Error: Could not find project to update notes."
    
@router_agent.system_prompt
def inject_workspace_context(ctx: RunContext[RouterDeps]) -> str:
    """
    Inject workspace context including file structure and current notes into the router agent's system prompt.
    
    Args:
        ctx: RunContext containing workspace and notes information
    
    Returns:
        System prompt string with workspace and notes context
    """
    return (
        f"Here is the current state of the user's project library and folder structure:\n"
        f"{ctx.deps.file_context}\n\n"
        f"📝 CURRENT NOTES IN EDITOR:\n"
        f"{ctx.deps.current_notes}\n\n"
        f"Use this to understand what files exist and what the user has already written. "
        f"If the user asks you to edit, write, or modify their notes, use the `overwrite_notes` tool."
    )

@router_agent.tool
def overwrite_notes(ctx: RunContext[RouterDeps], new_notes_content: str) -> str:
    """
    Overwrites the user's Co-Author Editor notes with new content.
    CRITICAL INSTRUCTION: This tool REPLACES the entire document. If the user asks you to "edit", "remove", 
    or "add" a specific section, you MUST include the rest of the existing notes in `new_notes_content` 
    so their previous work is not deleted!
    """
    print(f"\n[✍️ EDITOR TOOL] Agent is rewriting notes...")
    with Session(engine) as db:
        project = db.get(Project, ctx.deps.project_id)
        if project:
            project.notes = new_notes_content
            db.commit()
            return "Successfully updated the user's notes."
        return "Error: Could not find project to update notes."