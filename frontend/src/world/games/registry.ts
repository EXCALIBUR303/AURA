export type GameRuntime={pause:()=>void;resume:()=>void;dispose:()=>void|Promise<void>;save?:()=>unknown};
export type GameModule={mount:(container:HTMLElement,context:{signal:AbortSignal})=>GameRuntime|Promise<GameRuntime>};
export type GameDefinition={id:string;name:string;description:string;icon:"circuit"|"orbit";availability:"upcoming"|"installed";reason?:string;input:readonly("keyboard"|"pointer")[];presentation:"embedded";canSave:boolean;load?:()=>Promise<GameModule>};
/** Catalogue metadata is not an installation. No entry point, Play action or startup load. */
export const GAMES:readonly GameDefinition[]=[
 {id:"aura-circuit",name:"Circuit / original puzzle concept",description:"A future original developer-themed puzzle. No game code has been installed.",icon:"circuit",availability:"upcoming",reason:"Requires a separately reviewed implementation.",input:["keyboard","pointer"],presentation:"embedded",canSave:false},
 {id:"aura-orbit",name:"Orbit / arcade concept",description:"A reserved slot for a future original arcade experience.",icon:"orbit",availability:"upcoming",reason:"Not installed. No executable content is bundled.",input:["keyboard"],presentation:"embedded",canSave:false},
];
export function validateGame(game:GameDefinition){if(!/^[a-z][a-z0-9-]{0,47}$/.test(game.id)||game.availability==="installed"&&!game.load)throw Error("Game has no valid installation");}
GAMES.forEach(validateGame);
