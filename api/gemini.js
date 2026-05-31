export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { prompt } = req.body || {};

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Gemini API key is not configured in Vercel'
      });
    }

    const fullPrompt = `
${prompt}

IMPORTANT OUTPUT RULES:
Do not give a short answer.
Generate a complete, detailed result.
Use clear headings and bullet points.
For listing generation, include:
1. 5 optimized title options
2. 5 bullet points
3. Short product description
4. Long product description
5. Backend search keywords
6. Target customer profile
7. Marketplace SEO tips

Minimum length: 800 words unless the user specifically asks for something shorter.
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 8192
          }
        })
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Gemini request failed'
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      return res.status(500).json({
        error: 'Gemini returned an empty response'
      });
    }

    return res.status(200).json({ text });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Server error'
    });
  }
}
