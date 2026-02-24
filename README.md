# DeepCite 🧠📄

DeepCite is an AI-powered academic research assistant featuring a dynamic, split-pane workspace. It combines a conversational AI orchestrator, real-time web search capabilities, Retrieval-Augmented Generation (RAG) for PDF analysis, and a live LaTeX/Markdown editor into a single, seamless application.

## ✨ Key Features

* **Conversational Orchestrator Agent**: Powered by a 120B parameter model via Pydantic AI, capable of advanced reasoning and dynamic tool execution.
* **Real-Time Web Search**: Integrated DuckDuckGo search tool allows the agent to break past knowledge cutoffs, fetch real-time data, and cite web sources.
* **PDF Ingestion & Analysis**: Upload research papers directly into the agent's context window for targeted summarization and Q&A.
* **Native PDF Viewer**: Read uploaded papers directly in the browser via an optimized `iframe` implementation with local blob URLs.
* **Live LaTeX & Markdown Workspace**: A split-pane academic text editor. Write standard Markdown mixed with complex LaTeX math equations (`$$...$$`) and watch them render instantly via KaTeX.
* **Bulletproof Streaming (SSE)**: Built-in resilience against React Strict Mode doubling, network packet splitting, and API rate limits, providing a flawless streaming chat experience.

## 🛠️ Tech Stack

* **Frontend**: Next.js, React, Tailwind CSS, Shadcn UI (Resizable panels, Tabs, Sonner toasts), React Markdown, KaTeX.
* **Backend**: FastAPI, Pydantic AI, LiteLLM, `pypdf`, `python-multipart`, Server-Sent Events (SSE).