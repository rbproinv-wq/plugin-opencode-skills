import type { Router } from "./types.js";
import { VectorRouter } from "./vector-router.js";
import { JsonRouter } from "./json-router.js";
import { KeywordRouter } from "./keyword-router.js";

let _router: Router | null = null;

export async function createRouter(): Promise<Router> {
  const vector = new VectorRouter();
  if (await vector.health()) return vector;

  const json = new JsonRouter();
  if (await json.health()) return json;

  return new KeywordRouter();
}

export async function getRouter(): Promise<Router> {
  if (!_router) _router = await createRouter();
  return _router;
}

export function resetRouter(): void {
  _router = null;
}
