# Vibe ideas (after the first 20)

Source of inspiration: the owner's two reference sites. **verci.xyz** (13 lyric styles in three groups: kinetic type, motion scenes, "native design" phone screens) and **trylumn.xyz** (ambient edge light that follows the music). Everything below is an original idea built from a pattern, never a copy, and graphic or abstract only (no painted scenery, see `docs/vibe-redesign-plan.md`).

## From Verci's 13 styles

| Verci style | Pattern | Lyra idea (name) | How it would look |
|---|---|---|---|
| Ship | words land one by one on a wall that drifts in 3D | **Drift Wall** | big tiles with the words land on a perspective wall (CSS 3D); the camera drifts slowly along it |
| Fisheye | a tight stack of three words bulging through a lens | **Lens** | three lines stacked; the middle one bulges through a glass lens (SVG displacement), the lens follows the sung word |
| Visual | a centred stack with an icon for every word that has one | **Picto** | words with a small flat glyph beside them (moon, heart, fire, star, road, rain...), drawn as our own simple icons |
| Fisheye Visual | fisheye plus icons | folds into Lens | icons inside the lens |
| Codestyle | the lyric typed out as code under a blinking cursor | **Editor** | an IDE: tabs, line numbers, syntax colours, each line a string in a function, red caret; the terminal look stays separate (panes and a log) |
| Codestyle Visual | codestyle plus icons | folds into Editor | little inline icons as "decorations" |
| Branches | a line draws itself and each word lights a node | **Metro** | a transit-map line draws across the screen, every word is a station that lights as it is sung |
| Web | each line spun into a web, one strand per word | **Web** | a radial web builds one strand per word, the line sits on the strands |
| Constellation | stars traced star by star | already **Dream** | |
| Native Design (thread) | the song as a message thread | already **DM** (now with a real messaging look) | |
| Native Design Money | the song as a run of payments | **Wallet** | a payments feed: each line is a transaction row with an amount and a tick |
| Native Design Map | a walk with a pin per line | **Route** | an abstract street-grid map (lines only), a pin drops for every line and a route line grows |
| Native Design Notifications | lines arrive as lock-screen notifications, stacks and widgets | **Lock Screen** | a phone lock screen: each line is a notification card sliding in, older ones stack and dim, widgets on the sides |

## From the rest of the Verci site (not lyric styles)
- **Player status checklist** (why there are no lyrics): a tidy "what has to be true" list. Lyra already has a status pill; a proper checklist panel in Settings would be a good addition.
- **Nudge lyrics early/late**: Lyra has it (`[` and `]`).
- **Live preview of every style on a built-in track**: the settings gallery could play each look on a demo song, so a user can browse with nothing playing.
- **Select or pin**: pin favourite looks into a short list for `V` cycling (Lyra's "cycle" pool is the same idea).

## From Lumn (ambient edge light)
- A **light that follows the album colour and the beat** along the screen edge, with controls for thickness, glow and whether it moves or holds still. Each vibe already gets its own edge effect; a shared "Ambient" mode that is only edge light over any footage could be its own look.

## More ideas (Claude)
- **Split-flap**: an airport board where each word flips mechanically (strong motion, fully graphic).
- **Receipt**: a thermal-printer receipt that prints a line at a time and tears off.
- **Search**: the line typed into a search bar with suggestions dropping underneath.
- **Story cards**: vertical slides like a year-in-review, one line per card with big colour blocks.
- **Concert lights**: a dark stage, moving spotlights, the words lit by them.
- **Equaliser type**: the lyrics set as bars that rise as the words are sung.
- **Sheet music**: notes on a staff with the words under them (original drawing, no real score).
- **Elevator / floor display**: the current line as a big floor number panel (a funny, tiny look).

## Suggested build order (strongest motion and clearest identity first)
1. Lock Screen, 2. Wallet, 3. Split-flap, 4. Editor, 5. Metro, 6. Lens, 7. Picto, 8. Drift Wall, 9. Receipt, 10. Search.
