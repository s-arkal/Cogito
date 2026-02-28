import os
import chromadb
from dotenv import load_dotenv
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.litellm import LiteLLMProvider

load_dotenv()

chroma_client = chromadb.PersistentClient(path="./chroma_db")
vector_collection = chroma_client.get_or_create_collection(name="deepcite_vectors")

class LibrarianDeps(BaseModel):
    project_id: int

model = OpenAIChatModel(
    'gpt-oss-120b',
    provider=LiteLLMProvider(
        api_base='https://api.ai.it.ufl.edu',
        api_key=os.getenv('OPENAI_API_KEY')
    )
)

librarian_agent = Agent(
    model=model,
    deps_type=LibrarianDeps,
    system_prompt=(
        "You are the 'Librarian', an elite academic research assistant. "
        "Your ONLY job is to answer the user's questions strictly using the provided knowledge base (their uploaded PDFs). "
        "Always use your `read_uploaded_paper` tool to find evidence before answering. "
        "When responding, heavily cite the source filenames so the user knows exactly where the information came from. "
        "If the answer is not in the documents, explicitly state that you cannot find it in the current library."
    )
)

@librarian_agent.tool
def read_uploaded_paper(ctx: RunContext[LibrarianDeps], query: str) -> str:
    """
    Searches the user's uploaded documents for the given query. 
    Use this tool to find facts, quotes, and context before answering.
    """
    try:
        results = vector_collection.query(
            query_texts=[query],
            n_results=5, 
            where={"project_id": {"$eq": ctx.deps.project_id}}
        )
        
        if not results['documents'] or not results['documents'][0]:
            return "No relevant documents found in the library."
            
        formatted_results = []
        for i in range(len(results['documents'][0])):
            doc_text = results['documents'][0][i]
            metadata = results['metadatas'][0][i]
            filename = metadata.get("filename", "Unknown File")
            formatted_results.append(f"--- Excerpt from {filename} ---\n{doc_text}\n")
            
        return "\n".join(formatted_results)
    except Exception as e:
        return f"Error searching database: {str(e)}"