from typing import Any

from app.mcp.tools import MCPTools
import logging

logger = logging.getLogger(__name__)


class MCPServer:
    """MCP server for source-linked Indian rail guidance tools."""

    def __init__(self):
        self.tools = MCPTools()

    async def call_tool(self, tool_name: str, **kwargs) -> dict[str, Any]:
        try:
            if tool_name == "search_rail_guidance":
                query = kwargs.get("query")
                if not query:
                    return {"error": "Missing required parameter: query"}
                return {"results": await self.tools.search_guidance(query)}
            if tool_name == "get_rail_guidance_document":
                document_id = kwargs.get("document_id")
                if document_id is None:
                    return {"error": "Missing required parameter: document_id"}
                document = self.tools.get_guidance_document(document_id)
                return document or {"error": f"Guidance document {document_id} not found"}
            return {"error": f"Unknown tool: {tool_name}"}
        except Exception as error:
            logger.error("Error calling MCP tool %s: %s", tool_name, error)
            return {"error": str(error)}

    def list_tools(self) -> list[dict[str, Any]]:
        return [
            {
                "name": "search_rail_guidance",
                "description": "Search the source-linked Indian rail travel guidance corpus.",
                "parameters": {"query": "string (required)"},
            },
            {
                "name": "get_rail_guidance_document",
                "description": "Get a guidance document and official source by archive ID.",
                "parameters": {"document_id": "integer (required)"},
            },
        ]

    async def close(self):
        await self.tools.close()
