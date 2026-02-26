import os
from dotenv import load_dotenv
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.litellm import LiteLLMProvider
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool
from app.db import engine, Document
from sqlmodel import Session, select
from pydantic_ai import Agent, RunContext
import chromadb

load_dotenv()

chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_collection = chroma_client.get_or_create_collection(name="deepcite_documents")

document_store = {
    "current_pdf_text": "",
    "filename": ""
}

def set_pdf_text(filename: str, text: str):
    document_store["filename"] = filename
    document_store["current_pdf_text"] = text

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
    deps_type=int,
    system_prompt=(
        "You are DeepCite, an academic research assistant. "
        "You have access to the live web via DuckDuckGo, and you can read uploaded PDF documents. "
        "CRITICAL INSTRUCTIONS:\n"
        "1. If the user asks about an uploaded document or paper, use the 'read_uploaded_paper' tool FIRST.\n"
        "2. Do not use the web search tool to open URLs.\n"
        "3. Limit web searches to 2 max per query."
    )
)

@router_agent.tool
def search_uploaded_documents(ctx: RunContext[int], query: str) -> str:
    session_id = ctx.deps
    
    results = vector_collection.query(
        query_texts=[query],
        n_results=3,
        where={"session_id": session_id}
    )
    
    if not results['documents'] or not results['documents'][0]:
        return "No relevant information found in the uploaded documents for this session."
        
    formatted_results = "Here are the most relevant excerpts from the uploaded documents:\n\n"
    for i, doc_chunk in enumerate(results['documents'][0]):
        source_file = results['metadatas'][0][i]['filename']
        formatted_results += f"--- Excerpt from {source_file} ---\n{doc_chunk}\n\n"
        
    return formatted_results