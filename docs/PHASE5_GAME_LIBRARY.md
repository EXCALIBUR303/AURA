# Phase 5 game library — deferred at this checkpoint

The owner limited the current task to the spatial design foundation. No new playable game, game simulator, save format, library backend, TV gameplay preview or arcade launch integration was implemented.

The existing Gaming room, cabinet interaction and game-information surface remain available. The inherited two upcoming concepts remain metadata only; they must not be presented as playable. Existing generic game registry tests pass (6/6). The library receives the scoped spatial colours, without changing its lifecycle or capabilities.

For a separately approved implementation, the original brief proposes three original small games: AURA Neon Snake, AURA Breakout and AURA Reflex. Each must actually launch and provide rules, keyboard controls, scoring, pause, resume/restart, game-over and exit cleanup before it is labelled playable.

Future modules should declare a stable ID, lazy entry point, local asset dependencies/licences, input requirements, pause/resume/dispose interface, rendering mode, save-data requirements and a measured resource budget. Preserve the single world input owner; entering a game must release Explore input and exiting must restore the prior camera. Do not preload all games or add another full-rate simulation for the room TV without profiling.

Native save integration, external game engines, downloads and audio are not authorized by this foundation handoff. Voice and all audio-related development/testing remain frozen. [Native handoff](PHASE5_NATIVE_HANDOFF.md) records the stopping point.
