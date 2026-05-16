import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { parseRecognitionOutput, type RawBuilding } from "../../../lib/recognition/parser";

export const maxDuration = 60;

// ── Building IDs Claude must use (exact match with our data files) ────────────

const DEFENSE_IDS = [
  "cannon", "archer-tower", "mortar", "air-defense", "wizard-tower",
  "x-bow", "inferno-tower", "eagle-artillery", "scattershot", "monolith",
  "bomb-tower", "hidden-tesla", "air-sweeper",
  "bomb", "giant-bomb", "air-bomb", "spring-trap", "seeking-air-mine", "tornado-trap",
  "builder-hut",
];

const BUILDING_IDS = [
  "town-hall", "clan-castle", "army-camp", "barracks", "dark-barracks",
  "laboratory", "spell-factory", "dark-spell-factory", "workshop",
  "hero-hall", "blacksmith", "pet-house",
  "gold-mine", "elixir-collector", "dark-elixir-drill",
  "gold-storage", "elixir-storage", "dark-elixir-storage",
];

const SYSTEM_PROMPT = `You are an expert at analyzing Clash of Clans base screenshots.
Your task: identify every building on the base and return structured JSON via the provided tool.

The base uses a 44×44 isometric tile grid.
- Tile (0,0) is the top-left corner of the grid.
- Tile (43,43) is the bottom-right corner.
- Estimate the tile position (x, y) of each building's top-left corner.
- Buildings vary in size (1×1 to 6×6 tiles); output the top-left corner tile.

IMPORTANT: You MUST only use building IDs from these exact lists.

Defenses: ${DEFENSE_IDS.join(", ")}
Other buildings: ${BUILDING_IDS.join(", ")}

If you are unsure of the level, estimate 1. Do not invent IDs not in the lists above.`;

export async function POST(req: Request) {
  try {
    const { image, mediaType } = await req.json() as {
      image:     string;
      mediaType: "image/png" | "image/jpeg" | "image/webp";
    };

    if (!image) {
      return NextResponse.json({ error: "image is required" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY not set in environment" },
        { status: 500 },
      );
    }

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:      "claude-opus-4-7",
      max_tokens: 4096,
      system:     SYSTEM_PROMPT,
      tools: [
        {
          name:        "report_buildings",
          description: "Report all buildings identified in the screenshot.",
          input_schema: {
            type: "object",
            properties: {
              buildings: {
                type: "array",
                description: "List of all identified buildings.",
                items: {
                  type: "object",
                  properties: {
                    id:    { type: "string", description: "Building ID from the provided lists." },
                    x:     { type: "integer", description: "Tile column (0–43, left to right)." },
                    y:     { type: "integer", description: "Tile row (0–43, top to bottom)." },
                    level: { type: "integer", description: "Estimated level (1–20)." },
                  },
                  required: ["id", "x", "y", "level"],
                },
              },
            },
            required: ["buildings"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "report_buildings" },
      messages: [
        {
          role: "user",
          content: [
            {
              type:   "image",
              source: { type: "base64", media_type: mediaType, data: image },
            },
            { type: "text", text: "Identify all buildings in this Clash of Clans base screenshot." },
          ],
        },
      ],
    });

    // Extract tool_use block
    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json({ error: "Claude did not return a tool call" }, { status: 500 });
    }

    const raw = (toolBlock.input as { buildings: RawBuilding[] }).buildings ?? [];
    const result = parseRecognitionOutput(raw);

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/recognize-base]", err);
    return NextResponse.json({ error: "Recognition failed" }, { status: 500 });
  }
}
