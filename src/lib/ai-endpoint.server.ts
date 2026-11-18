// Escolhe onde a IA roda. Em servidor próprio, defina AI_API_KEY (+ AI_MODEL e,
// se não for OpenAI, AI_BASE_URL compatível com OpenAI). Sem AI_API_KEY, usa o
// gateway da Lovable com LOVABLE_API_KEY.
export function aiEndpoint(path: "/chat/completions" | "/responses", lovableModel: string, sdkHeader: string) {
  const ownKey = process.env.AI_API_KEY;
  if (ownKey) {
    const base = (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    return {
      available: true,
      url: base + path,
      model: process.env.AI_MODEL || lovableModel,
      headers: { Authorization: `Bearer ${ownKey}` } as Record<string, string>,
    };
  }
  const key = process.env.LOVABLE_API_KEY;
  return {
    available: !!key,
    url: "https://ai.gateway.lovable.dev/v1" + path,
    model: lovableModel,
    headers: (key ? { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": sdkHeader } : {}) as Record<string, string>,
  };
}
