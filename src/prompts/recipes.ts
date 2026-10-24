/**
 * Recipe prompts: ready-made slash commands (add death tracking, read why
 * players quit the last build, set up an A/B test, ask the guides).
 *
 * The recipes themselves live in `recipes.generated.ts`, generated from the
 * Playloop prompt source files so this package and the hosted server carry
 * the same text. This file only registers them; every argument is a required
 * string.
 */
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { PROMPT_RECIPES, renderPromptRecipe, type PromptRecipe } from './recipes.generated.js'

function recipeMessages(recipe: PromptRecipe, args: Readonly<Record<string, string | undefined>>) {
  return {
    messages: [
      {
        role: 'user' as const,
        content: { type: 'text' as const, text: renderPromptRecipe(recipe, args) },
      },
    ],
  }
}

export function registerRecipePrompts(server: McpServer): void {
  for (const recipe of PROMPT_RECIPES) {
    const meta = { title: recipe.title, description: recipe.description }
    if (recipe.args.length === 0) {
      server.registerPrompt(recipe.name, meta, () => recipeMessages(recipe, {}))
      continue
    }
    const argsSchema = Object.fromEntries(
      recipe.args.map((arg) => [arg.name, z.string().min(1).describe(arg.description)]),
    )
    server.registerPrompt(recipe.name, { ...meta, argsSchema }, (args: Record<string, string>) =>
      recipeMessages(recipe, args),
    )
  }
}
