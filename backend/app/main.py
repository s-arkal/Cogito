import json
import io
import pypdf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from pydantic_ai.messages import TextPartDelta, PartDeltaEvent, PartStartEvent
from fastapi import FastAPI, UploadFile, File
from app.agents.router import router_agent, set_pdf_text


from app.agents.router import router_agent

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    async def event_generator():
        try:
            accumulated_text = ""
            
            async for event in router_agent.run_stream_events(request.message):
                
                if isinstance(event, PartDeltaEvent):
                    if isinstance(event.delta, TextPartDelta):
                        payload = {"type": "text", "data": event.delta.content_delta}
                        yield {"data": json.dumps(payload)}
                
                elif isinstance(event, PartStartEvent):
                    if hasattr(event.part, 'tool_name'):
                        payload = {"type": "status", "data": f"DeepCite is using {event.part.tool_name}..."}
                        yield {"data": json.dumps(payload)}

        except Exception as e:
            payload = {"type": "text", "data": f"\n\n**Error:** {str(e)}"}
            yield {"data": json.dumps(payload)}

    return EventSourceResponse(event_generator())

@app.post("/api/upload")
async def upload_pdf(file: UploadFile = File(...)):
    try:
        content = await file.read()
        
        pdf_reader = pypdf.PdfReader(io.BytesIO(content))
        extracted_text = ""
        
        for page in pdf_reader.pages:
            text = page.extract_text()
            if text:
                extracted_text += text + "\n"
                
        set_pdf_text(file.filename, extracted_text)
        
        return {"success": True, "filename": file.filename, "message": "PDF processed successfully."}
        
    except Exception as e:
        print(f"Upload Error: {str(e)}")
        return {"success": False, "error": str(e)}