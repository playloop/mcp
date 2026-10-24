// GENERATED FILE. Do not edit by hand.
//
// The Playloop prompt recipes, generated from the prompt source files with
// `npm run mcp:prompts` in the Playloop app repo. Each one is registered as an
// MCP prompt (a slash command in Claude Code). Content hash, identical in
// every copy of this file: sha256:b8f4a9001ebb812d8d46f5b992669828148219d86045078bc68b04df4da722e3

export type PromptKind = 'recipe' | 'episode'

export interface PromptArg {
  name: string
  description: string
}

export interface PromptRecipe {
  name: string
  title: string
  description: string
  kind: PromptKind
  episode?: number
  args: readonly PromptArg[]
  tools: readonly string[]
  template: string
}

export const PROMPT_RECIPES: readonly PromptRecipe[] = [
  {
    "name": "add_death_tracking",
    "title": "Add death tracking",
    "description": "Record every player death and what caused it with the Playloop TypeScript SDK, then check it arrived.",
    "kind": "recipe",
    "args": [],
    "tools": [
      "list_games",
      "get_event_stats"
    ],
    "template": "Add death tracking to this game with the Playloop TypeScript SDK (`@playloop/sdk`).\n\n1. Find every place the player can die in the code.\n2. At each one, call `client.telemetry.track('player_died', { cause, level })`. Set `cause` to a short, stable name for what killed the player (for example `spikes`, `fell`, `boss_slam`) and `level` to the room or level id. One call per death, nothing else in the payload.\n3. If the SDK is not set up in this project yet, stop and tell me. Do not create a second client.\n4. Play to a death, or ask me to. Then call `list_games` to find this game and `get_event_stats` for it to confirm `player_died` arrived.\n\nTell me which death sites you wired, the cause names you picked, and what `get_event_stats` showed."
  },
  {
    "name": "how_do_i",
    "title": "Ask the Playloop guides",
    "description": "Answer a how-do-I question about Playloop from the public guides, with the page each step came from.",
    "kind": "recipe",
    "args": [
      {
        "name": "question",
        "description": "Your question, for example \"how do I test from the editor?\""
      }
    ],
    "tools": [
      "search_guides"
    ],
    "template": "Answer this question about Playloop: {{question}}\n\nCall `search_guides` with `q` set to the question. Answer from what comes back: short, steps in order, and the `url` of the page each step came from. If the guides do not cover it, say so plainly instead of guessing."
  },
  {
    "name": "read_last_build_quits",
    "title": "Why players quit the last build",
    "description": "Read why players quit your newest build and pick the one fix to make first.",
    "kind": "recipe",
    "args": [
      {
        "name": "game",
        "description": "Game id, slug, or exact name."
      }
    ],
    "tools": [
      "list_builds",
      "get_build_drop_reasons",
      "get_build_summary"
    ],
    "template": "Find out why players quit the newest build of the Playloop game \"{{game}}\".\n\n1. Call `list_builds` with `game=\"{{game}}\"`. The first build listed is the newest active one. Use its version.\n2. Call `get_build_drop_reasons` with that game and version.\n3. If it returns few or no reasons, call `get_build_summary` for the same build and say how many testers played it.\n\nReport the top reasons players quit with how many testers each covers, how many quit with no clear cause, and the one fix you would make first. Use only numbers from the responses."
  },
  {
    "name": "set_up_ab_test",
    "title": "Set up an A/B test",
    "description": "Draft an A/B experiment for one change, wire the variant into the game, and start it when the build is ready.",
    "kind": "recipe",
    "args": [
      {
        "name": "game",
        "description": "Game id, slug, or exact name."
      },
      {
        "name": "change",
        "description": "What to test, for example \"a shorter tutorial\"."
      }
    ],
    "tools": [
      "list_game_experiments",
      "create_experiment",
      "start_experiment"
    ],
    "template": "Set up an A/B test on the Playloop game \"{{game}}\" for this change: {{change}}\n\n1. Call `list_game_experiments` with `game=\"{{game}}\"` and check that nothing running already tests the same thing.\n2. Call `create_experiment` with two variants, `control` and `treatment`, at 50 each, named after the change. It starts as a draft.\n3. In the game code, read the variant with the experiment id `create_experiment` returned. In TypeScript that is `await client.experiments.variant('<experiment id>')`. `treatment` gets the change; `control` and `null` keep the current behavior.\n4. Show me the diff and wait. Starting locks the variants, so call `start_experiment` only after I confirm the build assigns them.\n\nCreating and starting need a management key with the member role or above."
  }
]

/** Fill a recipe's {{arg}} placeholders. A missing argument renders as an empty string. */
export function renderPromptRecipe(
  recipe: PromptRecipe,
  args: Readonly<Record<string, string | undefined>>,
): string {
  return recipe.template.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_, name: string) => args[name] ?? '')
}
