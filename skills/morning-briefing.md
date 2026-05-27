# Morning briefing

Summarise the day ahead for the user. Pull from these sources in order:

1. Today's weather (warmest, coolest, precipitation chance).
2. The 3 highest-priority items from the urgent inbox that are not yet done.
3. Any scheduled task whose next run is in the next 12 hours.
4. Market open snapshot for the watchlist tickers.

## Tone

Friendly but compact. One paragraph, max 90 words. Lead with weather, end
with markets. No emoji.

## Constraints

- Do not include anything older than 24 hours.
- Never reveal upstream API responses verbatim; summarise.
- If a source is unreachable, skip it silently rather than guessing.
