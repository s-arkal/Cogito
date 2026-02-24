import os
from dotenv import load_dotenv
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.litellm import LiteLLMProvider
from pydantic_ai.common_tools.duckduckgo import duckduckgo_search_tool

load_dotenv()

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
async def read_uploaded_paper(ctx: RunContext[None]) -> str:
    """
    Reads the text of the currently uploaded PDF document. 
    Use this when the user asks you to summarize, analyze, or answer questions about their uploaded paper.
    """
    text = document_store.get("current_pdf_text", "")
    filename = document_store.get("filename", "")
    
    if not text:
        return "No document is currently uploaded. Ask the user to upload a PDF first."
    
    print(f"--- Agent is reading uploaded paper: {filename} ---")
    
    return f"Document Filename: {filename}\n\nContent:\n{text[:50000]}"