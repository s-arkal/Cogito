import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.litellm import LiteLLMProvider

load_dotenv()

model = OpenAIChatModel(
    'gpt-oss-120b',
    provider=LiteLLMProvider(
        api_base='https://api.ai.it.ufl.edu',
        api_key=os.getenv('OPENAI_API_KEY')
    )
)

class CriticEvaluation(BaseModel):
    is_supported: bool = Field(description="True if the drafted claim is fully supported by the excerpts. False if there are hallucinations or external facts added.")
    feedback: str = Field(description="Explanation of what is wrong, or 'Looks good' if perfectly supported.")
    corrected_draft: str = Field(description="A rewritten version of the claim that STRICTLY adheres to the excerpts.")

class CriticDeps(BaseModel):
    source_excerpts: str

critic_agent = Agent(
    model=model,
    deps_type=CriticDeps,
    output_type=CriticEvaluation, 
    system_prompt=(
        "You are the 'Critic', a ruthless and elite academic peer-reviewer. "
        "Your ONLY job is to compare a drafted claim against the provided source excerpts. "
        "If the draft contains ANY information, dates, or concepts not explicitly present in the excerpts, "
        "you must flag it as unsupported (is_supported=false) and provide a strictly factual corrected draft."
    )
)

@critic_agent.system_prompt

def inject_excerpts(ctx: RunContext[CriticDeps]) -> str:
    """Inject source excerpts into the system prompt for the critic agent."""
def inject_excerpts(ctx: RunContext[CriticDeps]) -> str:
    return f"SOURCE EXCERPTS TO VERIFY AGAINST:\n{ctx.deps.source_excerpts}"