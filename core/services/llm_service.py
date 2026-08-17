import openai
from django.conf import settings

def ask_agri_guard_ai(context_str: str, user_message: str) -> str:
    """
    Calls the OpenAI API passing in the context block and the user message.
    """
    if not settings.OPENAI_API_KEY:
        return "[Mock RAG Response] Please set OPENAI_API_KEY. Based on context, there are active alerts."

    try:
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": "You are a helpful, empathetic agricultural assistant named AgriGuard AI. Use the provided context to answer questions. Keep answers concise (max 3 sentences)."},
                {"role": "user", "content": f"Context:\n{context_str}\n\nQuestion: {user_message}"}
            ]
        )
        return response.choices[0].message.content
    except Exception as e:
        raise RuntimeError("AI assistant is temporarily unavailable. Please try again later.") from e
