import logging
from typing import Any

from openai import AsyncOpenAI, APIError, APIConnectionError, RateLimitError

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

PROVIDER_CONFIGS = {
    "openai": {
        "base_url": None,
        "key_attr": "OPENAI_API_KEY",
        "model_attr": "OPENAI_MODEL",
    },
    "gemini": {
        "base_url": "https://generativelanguage.googleapis.com/v1beta/openai/",
        "key_attr": "GEMINI_API_KEY",
        "model_attr": "GEMINI_MODEL",
    },
    "groq": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_attr": "GROQ_API_KEY",
        "model_attr": "GROQ_MODEL",
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key_attr": "OPENROUTER_API_KEY",
        "model_attr": "OPENROUTER_MODEL",
    },
}

FALLBACK_ORDER = ["openai", "gemini", "groq", "openrouter"]


def _build_client(provider: str) -> tuple[AsyncOpenAI, str] | None:
    config = PROVIDER_CONFIGS.get(provider)
    if not config:
        return None

    api_key = getattr(settings, config["key_attr"], "")
    model = getattr(settings, config["model_attr"], "")

    if not api_key:
        return None

    kwargs: dict[str, Any] = {"api_key": api_key}
    if config["base_url"]:
        kwargs["base_url"] = config["base_url"]

    return AsyncOpenAI(**kwargs), model


def _get_provider_chain() -> list[str]:
    primary = settings.LLM_PROVIDER
    chain = [primary] + [p for p in FALLBACK_ORDER if p != primary]
    return chain


async def llm_chat(
    prompt: str,
    temperature: float = 0.3,
    response_format: dict | None = None,
) -> str:
    chain = _get_provider_chain()
    last_error = None

    for provider in chain:
        result = _build_client(provider)
        if not result:
            logger.debug(f"Skipping {provider}: no API key")
            continue

        client, model = result

        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": temperature,
        }
        if response_format:
            kwargs["response_format"] = response_format

        try:
            logger.info(f"Trying LLM: {provider}/{model}")
            response = await client.chat.completions.create(**kwargs)
            content = response.choices[0].message.content
            if content:
                logger.info(f"Success with {provider}/{model}")
                return content
            logger.warning(f"{provider} returned empty content")
        except RateLimitError as e:
            logger.warning(f"{provider} rate limited: {e}")
            last_error = e
        except APIConnectionError as e:
            logger.warning(f"{provider} connection failed: {e}")
            last_error = e
        except APIError as e:
            logger.warning(f"{provider} API error: {e}")
            last_error = e
        except Exception as e:
            logger.warning(f"{provider} failed: {type(e).__name__}: {e}")
            last_error = e

    raise RuntimeError(
        f"All LLM providers failed. Tried: {', '.join(chain)}. "
        f"Last error: {last_error}"
    )
