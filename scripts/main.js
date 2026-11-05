// MINDRUN 0.4. 0.1 (user 2026-11-03: "simple missions solved fast, back to back, as a speedrun challenge", a separate mod beside MINDLE).
// A run is every mission once, each on its own tiny room. A mission ends the moment its condition is met (no holding);
// the conveyor mission ends the moment the belts are connected, items or not (user 2026-11-03).
// Time is real time from the first playing frame of each mission, counted while playing (not loading; pause counts in runs, not in practice), shown to 0.001 s. Skip = +SKIP_PENALTY s.
// 0.3 (user 2026-11-03): normal or hard; hard opens when a normal run is cleared under UNLOCK_S s without skips.
// 0.4: one map, 10 stages in a fixed order, each painted in place (see missions).
// Start: main menu > Play > Join Game > [MINDRUN]. Skip / quit in the ESC menu.
// Recorded in WORDLE/logs/mindrun/<stamp>/result.json; the best run in WORDLE/runtime/mindrun-best.json.
// records live in Documents\My Games\Mindustry_RUN, the same on any PC (user 2026-11-04); before 0.9.10 they were in Desktop\WORDLE
function wBase(){
    // phones have no Documents folder we can write to: keep records in the game's own data folder (0.13.15)
    try{ if(Packages.arc.util.OS.isAndroid || Packages.arc.util.OS.isIos) return String(Packages.arc.Core.settings.getDataDirectory().child("mindrun").absolutePath()); }catch(e){ print("mindrun base " + e); }
    var h = String(java.lang.System.getProperty("user.home")).replace(/\\/g, "/");
    var docs = [h + "/Documents", h + "/OneDrive/Documents", h + "/OneDrive/문서"], d = docs[0];
    for(var i = 0; i < docs.length; i++){ try{ if(Packages.arc.Core.files.absolute(docs[i]).exists()){ d = docs[i]; break; } }catch(e){} }
    var base = d + "/My Games/Mindustry_RUN";
    try{   // carry the old best times and practice records over once
        var F0 = Packages.arc.Core.files, nb = F0.absolute(base + "/runtime/mindrun-best.json");
        if(!nb.exists()){
            var old = [h + "/Desktop/WORDLE", h + "/OneDrive/Desktop/WORDLE"];
            for(var j = 0; j < old.length; j++){ var ob = F0.absolute(old[j] + "/runtime/mindrun-best.json"); if(ob.exists()){ nb.parent().mkdirs(); ob.copyTo(nb); break; } }
        }
    }catch(e){ print("mindrun migrate " + e); }
    return base;
}
var BASE = wBase(), VERSION = "mindustry-speedrun/0.13.23";
var DIR = BASE + "/runtime", LOGS = BASE + "/logs/mindrun";
// 0.9 (user 2026-11-03): a run fails when its time runs out. The user's own clears were normal 47.892 s and hard 96.214 s; about 15 s on top.
var LIMIT = {normal: 120, hard: 165};   // normal 120 s, hard 165 s (user 2026-11-04, 45 stages)   // 0.13 (user 2026-11-04): for 45 stages until timed again; was normal 90 s, hard 125 s   // normal 90 s, hard 125 s (user 2026-11-04)   // 0.10: three more stages (repair, wall-place, flare), about +15 s normal and +20 s hard until the user measures again
var SKIP_PENALTY = 20, NEXT_DELAY_MS = 0, UNLOCK_S = LIMIT.normal;   // hard opens with any clean normal clear inside the limit
var F = Packages.arc.Core.files;
var B = Packages.mindustry.content.Blocks, I = Packages.mindustry.content.Items, U = Packages.mindustry.content.UnitTypes;
var MapC = Packages.mindustry.maps.Map, StringMap = Packages.arc.struct.StringMap, Seq = Packages.arc.struct.Seq;
var SE = Packages.mindustry.content.StatusEffects;
// hard "move": the player rides a Dagger at 5x speed (user 2026-11-03); a hidden status made with the mod's content
var FAST = null;
var FAST10 = null;   // the ending dash: 15x (user 2026-11-04: 10x, then 1.5 times that)
try{ FAST10 = new Packages.mindustry.type.StatusEffect("mindrun-fast10"); FAST10.speedMultiplier = 15; FAST10.show = false; FAST10.permanent = true; }catch(e){ print("mindrun fast10 " + e); }
try{ FAST = new Packages.mindustry.type.StatusEffect("mindrun-fast"); FAST.speedMultiplier = 5; FAST.show = false; FAST.permanent = true; }catch(e){ print("mindrun fast " + e); }
var FAST3 = null;   // the lava crossing: 3x
try{ FAST3 = new Packages.mindustry.type.StatusEffect("mindrun-fast3"); FAST3.speedMultiplier = 3; FAST3.show = false; FAST3.permanent = true; }catch(e){ print("mindrun fast3 " + e); }
var Tile = Packages.mindustry.world.Tile, Team = Packages.mindustry.game.Team, Rules = Packages.mindustry.game.Rules;

// run state
// practice (user 2026-11-03): one stage over and over, picked from a list; previous / next stage from the ESC menu
var practiceIdx = 0, practiceHard = false, attempt = 0;
var runList = null, idx = -1, splits = [], runStamp = null, runSeed = 0, mode = "normal", mission = null, ctx = null,
    pending = false, worldLoaded = false, started = false, elapsed = 0, lastNano = 0, done = false, nextAt = 0, active = false, line = null;

function rd(path){ var f = F.absolute(path); return f.exists() ? JSON.parse(String(f.readString("UTF-8"))) : null; }
function wr(path, v){ var f = F.absolute(path); f.parent().mkdirs(); var t = f.sibling(f.name() + ".tmp"); t.writeString(JSON.stringify(v), false); t.moveTo(f); }
function stamp(){ return new java.text.SimpleDateFormat("yyyyMMdd-HHmmss").format(new java.util.Date()); }
// 0.3.2: no toFixed: in the game's Rhino it kept two significant digits (28.437 -> "28.00", user 2026-11-03), so the digits are built by hand
function fixed(v, d){ var p = Math.pow(10, d), n = Math.round(Math.abs(v)*p), w = Math.floor(n/p), f = String(n - w*p); while(f.length < d) f = "0" + f; return (v < 0 ? "-" : "") + w + (d > 0 ? "." + f : ""); }
function sec(s){ return fixed(s, 3) + "초"; }
function stageSeed(id){ var h = 7; for(var i = 0; i < id.length; i++) h = (h*31 + id.charCodeAt(i)) % 1000000007; return h; }
function rng(seed){ var jr = new java.util.Random(seed); return function(){ return Number(jr.nextDouble()); }; }
function ri(r, a, b){ return a + Math.floor(r()*(b - a + 1)); }
function itemName(name){ var it = Vars.content.item(name); return it == null ? name : String(it.localizedName); }

// ---- rooms ----
// 0.2 (user 2026-11-03): each mission has its own look (floor, walls, decoration) and the room need not be a rectangle.
// Every mission feature lies in a "keep" box that is always open, and each box is joined to an open band through the core row,
// so the shape and the decoration can never cut the way.
var THEMES = {
    grass:   {floor: [B.grass, B.moss],                wall: B.stoneWall, decor: [B.shrubs, B.pine],          path: [B.dirt, B.mud]},
    spore:   {floor: [B.moss, B.sporeMoss],            wall: B.sporeWall, decor: [B.sporePine, B.sporeWall],  path: [B.dirt, B.mud]},
    factory: {floor: [B.metalFloor, B.metalFloorDamaged, B.darkPanel1], wall: B.darkMetal, decor: [B.darkMetal], path: null},
    desert:  {floor: [B.sand, B.darksand],             wall: B.sandWall,  decor: [B.sandBoulder, B.sandWall], path: null},
    snow:    {floor: [B.snow, B.ice],                  wall: B.snowWall,  decor: [B.snowPine, B.snowBoulder], path: null},
    cave:    {floor: [B.dacite, B.basalt, B.charr],    wall: B.daciteWall, decor: [B.daciteBoulder, B.daciteWall], path: null},
    // Erekir (user 2026-11-04): no red stone anywhere, so it never looks like hard mode
    "erekir-carbon": {floor: [B.carbonStone, B.ferricStone], wall: B.carbonWall, decor: [B.carbonBoulder, B.ferricBoulder], path: null},
    "erekir-yellow": {floor: [B.yellowStone, B.regolith], wall: B.yellowStoneWall, decor: [B.yellowStoneBoulder], path: null},
    "erekir-arkyic": {floor: [B.arkyicStone, B.beryllicStone], wall: B.arkyicWall, decor: [B.arkyicBoulder, B.beryllicBoulder], path: null}
};
// hard rooms have red walls so the mode shows at a glance (user 2026-11-03)
function wallFor(c){ if(c.hard){ var w = Vars.content.block("red-stone-wall"); if(w != null) return w; } return THEMES[c.theme].wall; }
var SHAPES = ["rect", "ellipse", "triangle", "diamond", "rounded", "cross"];
function inShape(shape, x, y, W, H){
    var nx = (x - (W - 1)/2)/((W - 2)/2), ny = (y - (H - 1)/2)/((H - 2)/2);   // -1..1 inside the border
    if(shape == "ellipse") return nx*nx + ny*ny <= 1;
    if(shape == "triangle") return Math.abs(ny) <= 1 - (nx + 1)/2*0.85;   // wide at the core side, narrow at the far side
    if(shape == "diamond") return Math.abs(nx) + Math.abs(ny) <= 1.05;
    if(shape == "cross") return Math.abs(nx) < 0.5 || Math.abs(ny) < 0.45;
    if(shape == "rounded"){ var ax = Math.max(0, Math.abs(nx) - 0.6)/0.4, ay = Math.max(0, Math.abs(ny) - 0.4)/0.6; return ax*ax + ay*ay <= 1; }
    return true;
}

// ---- missions ----
// 0.4 (user 2026-11-03): one map for the whole run, stages in a fixed order, no loading and no walking between stages:
// each stage repaints the same room in place (it appears out of nothing), except a chained stage, which keeps the room and what the player made.
// Non-chained: plan(c, r) chooses positions and c.keep boxes, place(c, r) puts blocks in (T = the world's tiles).
// All: start(c) when the stage begins, check(c) true the moment it is cleared. sandbox: free building. cost: build cost multiplier.
var W = 36, H = 19, CY = 9, CORE_X = 3;
// 0.9.4 (user 2026-11-04): the world runs on to the right for the last stage, a long straight dash to the reactor; every other stage walls it off
var WW = 110;
// 0.4.3 (user 2026-11-03): a whitelist per stage, only the blocks the stage needs (allow), so nothing can be built early or used as a shortcut
function setAllowed(names){
    var rules = Vars.state.rules, list = rules.bannedBlocks;
    rules.blockWhitelist = true; list.clear();
    (names || []).forEach(n => { var b = Vars.content.block(n); if(b != null) list.add(b); });
    try{ Vars.ui.hudfrag.blockfrag.rebuild(); }catch(e){}   // the build menu shows only these
}
// copper in the core, held at a fixed amount (chain stages)
function holdCopper(n){ var core = Vars.player.team().core(); if(core != null && core.items.get(I.copper) != n) core.items.set(I.copper, n); }
// repaint the floor meshes: a chunk recache redraws only the layers still used, so an ore that left stayed on screen (user 2026-11-03)
// the user's game has reload() (newer builds); v146 has clearTiles() (user's error log 2026-11-03)
function floorReload(){
    var fr = Vars.renderer.blocks.floor;
    try{ fr.reload(); return; }catch(e){}
    try{ fr.clearTiles(); }catch(e2){ logErr("recache " + e2); }
}
function redrawFloor(){
    floorReload();
    try{ Packages.arc.Core.app.post(run(() => floorReload())); }catch(e){ logErr("post " + e); }
}
// ---- music (user 2026-11-03): Zane Little - Shortcuts (OpenGameArt, CC0), looped while a run is on; the game's own music is held off ----
// loaded with the mod (scripts run while the game loads its assets), only if the file is in the mod
var runMusic = null, musicHold = false;   // musicHold: the run is over but the music plays on until the results window closes or the main menu (user 2026-11-03)
function musicTrack(){ return runMusic; }
function loadMusicNow(){
    try{
        var t = Vars.tree;
        if(t.get("music/mindrun.ogg").exists() || t.get("music/mindrun.mp3").exists()) runMusic = t.loadMusic("mindrun");
    }catch(e){ print("mindrun music load " + e); }
}
// Settings > Sound (user 2026-11-03): "MINDRUN 배경음악만 허용" plays the run music at its own volume even with the game's music at 0
function musicVolume(){
    var S = Packages.arc.Core.settings;
    return S.getBool("mindrun-music-only", false) ? S.getInt("mindrun-musicvol", 80)/100 : S.getInt("musicvol")/100;
}
function musicSettings(){
    try{
        var props = Packages.arc.Core.bundle.getProperties();
        props.put("setting.mindrun-music-only.name", "MINDRUN 배경음악만 허용");
        props.put("setting.mindrun-musicvol.name", "MINDRUN 배경음악 음량");
    }catch(e){ print("mindrun bundle " + e); }
    var snd = Vars.ui.settings.sound;
    snd.checkPref("mindrun-music-only", false);
    snd.sliderPref("mindrun-musicvol", 80, 0, 100, 5, new Packages.mindustry.ui.dialogs.SettingsMenuDialog.StringProcessor({get: i => i + "%"}));
}
function musicUpdate(){
    try{
        var m = musicTrack(); if(m == null) return;
        if(Vars.state.isMenu()) musicHold = false;
        var on = (active || musicHold) && !Vars.state.isMenu();
        if(on){
            try{ Vars.control.sound.stop(); }catch(e){}   // keep the game's tracks quiet
            m.setVolume(musicVolume());
            if(!m.isPlaying()){ m.setLooping(true); m.play(); }
        }else if(m.isPlaying()) m.stop();
    }catch(e){ logErr("music " + e); }
}
var lastErr = "";
function logErr(msg){ msg = String(msg); if(msg == lastErr) return; lastErr = msg; print("mindrun " + msg); try{ F.absolute(BASE + "/runtime/mindrun-errors.txt").writeString(stamp() + " " + VERSION + " " + msg + "\n", true); }catch(e){} }
function T(x, y){ return Vars.world.tile(x, y); }
function teamBuilds(f){ var out = []; Vars.player.team().data().buildings.each(b => { if(f(b)) out.push(b); }); return out; }

// stage-placed blocks that must stay: restored the moment one is broken or being broken (user 2026-11-03: the filter must not be removable)
function protect(c, x, y){ var t = T(x, y); if(t == null || t.build == null) return; (c.protect = c.protect || []).push({x: x, y: y, block: t.block(), team: t.team(), rot: t.build.rotation, item: t.build.outputItem === undefined ? null : t.build.outputItem, sort: t.build.sortItem === undefined ? null : t.build.sortItem}); }
function protectTick(c){
    if(c == null || c.protect == null) return;
    c.protect.forEach(p => {
        var t = T(p.x, p.y); if(t == null || t.block() == p.block) return;
        t.setBlock(p.block, p.team, p.rot);
        if(p.item != null && t.build != null){ try{ t.build.outputItem = p.item; }catch(e){} }
        if(p.sort != null && t.build != null){ try{ t.build.sortItem = p.sort; }catch(e){} }
    });
}
// the player rides a given unit for a stage (hard move: a Dagger, transport: a Mega); leaving it puts them back
function mountPlayer(c, type, fast){
    var old = Vars.player.unit(), d = type.spawn(Team.sharded, (CORE_X + 3)*8, CY*8);
    var eff = fast === true ? FAST : fast; if(eff != null && eff !== false) d.apply(eff, 1e7);
    c.mount = d; Vars.player.unit(d);
    if(old != null && old != d && old.type != U.block) old.remove();
}
function keepMount(c){
    if(c.mount == null || !c.mount.isAdded()) return;
    if(Vars.player.unit() != c.mount){ var o = Vars.player.unit(); Vars.player.unit(c.mount); if(o != null && o != c.mount && o.type != U.block) o.remove(); }
}
function unmount(c){ if(c.mount != null){ var d = c.mount; c.mount = null; if(Vars.player.unit() == d) Vars.player.clearUnit(); d.remove(); } }
// the square to reach: core-zone tiles stand out on every theme (metal floor vanished on the factory theme, user 2026-11-03)
// decoration (shrubs, pines, boulders) left inside a corridor can block the only way (user 2026-11-03)
function clearDecor(x, y){ var t = T(x, y); if(t != null && t.build == null && t.block() != B.air) t.setAir(); }
function markFloor(){ var f = Vars.content.block("core-zone"); return f != null ? f : B.metalFloor; }
// Erekir stages: the broken wall near the core, a fake defence line (derelict walls, cannot be picked up) with one gap
function erekirPlan(c, r, hardTitle){
    c.shape = "rect"; c.wallBlock = c.hard ? B.berylliumWall : B.berylliumWallLarge;
    c.wp = [ri(r, 10, 13), ri(r, 3, H - 6)]; c.lx = ri(r, 22, 26); c.gy = 1 + 2*ri(r, 1, Math.floor((H - 7)/2));   // odd, so the large walls line up
    c.keep = [[c.wp[0] - 1, c.wp[1] - 1, c.wp[0] + 2, c.wp[1] + 2], [c.lx - 2, 1, c.lx + 3, H - 2]];
    if(c.hard) c.title = hardTitle;
}
// water puddle on the tile or one of its eight neighbours
function wetNear(x, y){
    var Pd = Packages.mindustry.entities.Puddles, water = Packages.mindustry.content.Liquids.water;
    for(var dx = -1; dx <= 1; dx++) for(var dy = -1; dy <= 1; dy++){
        try{ var t = T(x + dx, y + dy); if(t == null) continue; var p = Pd.get(t); if(p != null && p.liquid == water && Number(p.amount) > 0) return true; }catch(e){ logErr("wetNear " + e); }
    }
    return false;
}
function erekirPlace(c, r, hp){
    for(var x = c.lx - 2; x <= c.lx + 3; x++) for(var y = 1; y <= H - 2; y++) clearDecor(x, y);
    if(c.hard){
        for(var y1 = 1; y1 <= H - 2; y1++) if(y1 != c.gy){ T(c.lx, y1).setBlock(B.berylliumWall, Team.derelict); protect(c, c.lx, y1); }
    }else{
        for(var y2 = 1; y2 + 1 <= H - 2; y2 += 2) if(y2 != c.gy){ T(c.lx, y2).setBlock(B.berylliumWallLarge, Team.derelict); protect(c, c.lx, y2); }
        if((H - 2) % 2 == 1) for(var dx = 0; dx < 2; dx++){ T(c.lx + dx, H - 2).setBlock(B.berylliumWall, Team.derelict); protect(c, c.lx + dx, H - 2); }
    }
    T(c.wp[0], c.wp[1]).setBlock(c.wallBlock, Team.sharded);
    var b = T(c.wp[0], c.wp[1]).build; if(b != null) b.health = b.maxHealth*hp;
}
// turbine stages: 3x3 carbon vents (two in hard) and the tank the water goes to
function turbinePlan(c, hardTitle){
    c.shape = "rect"; c.vents = c.hard ? [[13, 5], [13, H - 6]] : [[14, CY]]; c.tank = c.hard ? [W - 6, CY] : [W - 8, CY + 3]; c.wx = 22;
    c.keep = c.vents.map(v => [v[0] - 2, v[1] - 2, v[0] + 2, v[1] + 2]).concat([[c.tank[0] - 1, c.tank[1] - 1, c.tank[0] + 2, c.tank[1] + 2]]);
    if(c.hard) c.title = hardTitle;
}
function turbinePlace(c, given){
    c.vents.forEach(v => { for(var x = v[0] - 1; x <= v[0] + 1; x++) for(var y = v[1] - 1; y <= v[1] + 1; y++){ clearDecor(x, y); T(x, y).setFloor(B.carbonVent); }
        if(given){ T(v[0], v[1]).setBlock(B.turbineCondenser, Team.sharded); } });
    T(c.tank[0], c.tank[1]).setBlock(B.reinforcedLiquidContainer, Team.sharded); protect(c, c.tank[0], c.tank[1]);
    if(c.hard) for(var y2 = 1; y2 <= H - 2; y2++){ if(Math.abs(y2 - 3) <= 1) continue; clearDecor(c.wx, y2); T(c.wx, y2).setBlock(wallFor(c)); }   // a wall with a gap near the top
}
// radar stages: a power source to build beside, the hidden boxes far away
function radarPlan(c, hardTitle){
    c.shape = "rect"; c.ps = [9, CY + 3]; c.hidden = c.hard ? [[W - 4, 2], [W - 4, H - 3], [24, H - 3]] : [[W - 4, H - 3]];
    c.keep = [[c.ps[0] - 2, c.ps[1] - 2, c.ps[0] + 2, c.ps[1] + 2]].concat(c.hidden.map(p => [p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1]));
    if(c.hard) c.title = hardTitle;
}
function radarPlace(c, given){
    for(var x = c.ps[0] - 1; x <= c.ps[0] + 1; x++) for(var y = c.ps[1] - 1; y <= c.ps[1] + 1; y++) clearDecor(x, y);
    T(c.ps[0], c.ps[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.ps[0], c.ps[1]);
    if(given) T(c.ps[0] + 1, c.ps[1]).setBlock(B.radar, Team.sharded);
}
// fog of war only in the radar stages (dynamic fog, no black map); the core unit sees little so the radar matters
var alphaFog = null;
function fogOn(){
    try{ var R = Vars.state.rules; R.fog = true; R.staticFog = false; }catch(e){ logErr("fog on " + e); }
    try{ Vars.ui.hudfrag.blockfrag.rebuild(); }catch(e){}   // the radar shows in the build menu only with fog on
    try{ if(alphaFog == null) alphaFog = U.alpha.fogRadius; U.alpha.fogRadius = 3; }catch(e){ logErr("fog alpha " + e); }
}
function fogOff(){
    darkOff();
    try{ Vars.state.rules.fog = false; }catch(e){}
    try{ if(alphaFog != null){ U.alpha.fogRadius = alphaFog; alphaFog = null; } }catch(e){}
}
var MEMO_WORDS = ["run", "pet", "man", "top", "set", "cat", "dog", "sun", "map", "box", "cup", "red", "big", "hot", "pen", "net", "jet", "fun", "win", "key"];
function memoWord(){ return MEMO_WORDS[Math.floor(Math.random()*MEMO_WORDS.length)]; }
// canvas shapes as rows: "#" the main colour, "o" the second colour (hard)
var CANVAS_EASY = [["#.#", ".#.", "#.#"], [".#.", "###", ".#."], ["##", "##"], ["#..", "#..", "###"], ["###", ".#.", ".#."], ["#", "#", "#", "#"], [".#", "##", "#."]];
var CANVAS_HARD = [[".##.##.", "#######", ".#####.", "..###..", "...o..."], ["#.....#", "...o...", "#.....#", ".#####."], ["..#..", ".###.", "#####", "..o..", "..o.."], ["###.###", "#o#.#o#", "###.###"], ["o...o", ".#.#.", "..#..", ".#.#.", "o...o"]];
function canvasPick(hard){
    var list = hard ? CANVAS_HARD : CANVAS_EASY, rows = list[Math.floor(Math.random()*list.length)];
    var c1 = 1 + Math.floor(Math.random()*7), c2 = 1 + (c1 + Math.floor(Math.random()*6)) % 7;   // two different colours, never the blank one
    var w = rows[0].length, h = rows.length, ox = Math.floor(Math.random()*(13 - w)), oy = Math.floor(Math.random()*(13 - h)), out = [];
    rows.forEach((row, ry) => { for(var rx = 0; rx < row.length; rx++){ var ch = row.charAt(rx); if(ch != ".") out.push([ox + rx, oy + (h - 1 - ry), ch == "#" ? c1 : c2]); } });
    return out;
}
function canvasCells(b){ var out = []; for(var i = 0; i < 144; i++){ var v = Number(b.getPixel(i)); if(v > 0) out.push([i % 12, Math.floor(i/12), v]); } return out; }
// the shape moved to its corner, so the place on the canvas does not matter
function shapeKey(cells){
    if(cells.length == 0) return "";
    var mx = Math.min.apply(null, cells.map(p => p[0])), my = Math.min.apply(null, cells.map(p => p[1]));
    return cells.map(p => (p[0] - mx) + "," + (p[1] - my) + "," + p[2]).sort().join(";");
}
// the sample picture on the left canvas, kept as it is
function canvasPaint(c){
    var a = T(c.a[0], c.a[1]).build; if(a == null || a.data == null) return;
    var want = {}; c.pic.forEach(p => want[p[0] + p[1]*12] = p[2]);
    for(var i = 0; i < 144; i++){ var w = want[i] || 0; try{ if(a.getPixel(i) != w) a.setPixel(i, w); }catch(e){ logErr("canvas " + e); return; } }
}
// a player field, read as a field or through its getter (generated entity fields)
function pval(n){ try{ var v = Vars.player[n]; if(typeof v == "function") v = Vars.player[n](); v = Number(v); return isNaN(v) ? 0 : v; }catch(e){ return 0; } }
// a turret has rotate = true too, and its rotation reads as its aim angle (the Duo never matched, user 2026-11-04): only belts care which way they face
function rotMatters(block){ return String(block.name).indexOf("conveyor") >= 0; }
// blocks as [x, y, name, rotation], moved to their corner, as one string
function partsKey(list){ if(list.length == 0) return ""; var mx = Math.min.apply(null, list.map(p => p[0])), my = Math.min.apply(null, list.map(p => p[1]));
    return list.map(p => (p[0] - mx) + "," + (p[1] - my) + "," + p[2] + "," + p[3]).sort().join(";"); }
// a container that has taken at least one item
function boxGot(p){ var t = T(p[0], p[1]); return t != null && t.build != null && t.build.items != null && t.build.items.total() > 0; }
// the processor's code: open every door it is linked to
function procCode(c){ var b = T(c.p[0], c.p[1]).build; if(b == null || b.block != B.microProcessor) return;
    var code = c.doors.map((d, i) => "control enabled door" + (i + 1) + " 1 0 0 0").join("\n");
    try{ if(String(b.code) != code) b.updateCode(code); }catch(e){ logErr("processor code " + e); } }
// lights out for the light stage; back on after
function darkOn(){ try{ var R = Vars.state.rules; R.lighting = true; R.ambientLight.set(0.01, 0.01, 0.03, 0.96); }catch(e){ logErr("dark " + e); } }
function darkOff(){ try{ Vars.state.rules.lighting = false; }catch(e){} }
// the Breach stages
function breachPlan(c, hardTitle){ c.shape = "rect"; c.br = [12, CY + 3]; c.keep = [[c.br[0] - 2, c.br[1] - 2, c.br[0] + 2, c.br[1] + 2], [22, 2, W - 3, H - 3]]; if(c.hard) c.title = hardTitle; }
function breachPlace(c, loaded){
    T(c.br[0], c.br[1]).setBlock(B.breach, Team.sharded, 0); protect(c, c.br[0], c.br[1]);
    var b = T(c.br[0], c.br[1]).build; if(loaded && b != null) for(var k = 0; k < 10 && b.acceptItem(b, I.beryllium); k++) b.handleItem(b, I.beryllium);
}
// no building or breaking from the unit the player rides
function noBuild(){ var u = Vars.player.unit(); if(u != null){ try{ u.plans.clear(); u.updateBuilding = false; }catch(e){} } }
function wallNext(c){ var p = c.spots[c.n]; if(p == null) return; var t = T(p[0], p[1]); if(t.build != null) t.setAir(); t.setBlock(B.copperWall, Team.sharded); }

var MISSIONS = [
    {id: "move", title: "표시된 칸으로 이동하세요!", sandbox: true, themes: ["grass", "snow"],
     plan: (c, r) => {
        if(c.hard){ c.shape = "rect"; c.tx = W - 4; c.ty = ri(r, CY - 2, CY + 2); c.title = "대거로 이동하세요! (하드)"; }
        else{ c.tx = ri(r, 20, W - 5); c.ty = ri(r, 3, H - 4); }
        c.keep = [[c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2]];
     },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        if(!c.hard) return;
        // hard (user 2026-11-03): a sealed corridor with posts from top and bottom in turn, like the hard conveyor
        var wall = wallFor(c), y0 = c.ty;
        for(var hx = 7; hx <= W - 2; hx++) for(var hy = 1; hy < H - 1; hy++){
            if(hy > y0 - 4 && hy < y0 + 4){ clearDecor(hx, hy); continue; }
            var ht = T(hx, hy); if(ht != null && ht.build == null) ht.setBlock(wall);
        }
        for(var k = 0, px = 10; px <= W - 7; k++, px += 3)
            for(var yy = (k % 2 == 0 ? y0 - 3 : y0 - 1); yy <= (k % 2 == 0 ? y0 + 1 : y0 + 3); yy++) T(px, yy).setBlock(wall);
     },
     // hard: put the player in a fast Dagger; the core unit goes away
     start: c => {
        if(!c.hard) return;
        var old = Vars.player.unit(), d = U.dagger.spawn(Team.sharded, (CORE_X + 3)*8, CY*8);
        if(FAST != null) d.apply(FAST, 1e7);
        c.mount = d; Vars.player.unit(d);
        if(old != null && old != d && old.type != U.block) old.remove();
     },
     tick: c => {   // no leaving the Dagger
        if(c.mount == null || !c.mount.isAdded()) return;
        if(Vars.player.unit() != c.mount){ var o = Vars.player.unit(); Vars.player.unit(c.mount); if(o != null && o != c.mount && o.type != U.block) o.remove(); }
     },
     leave: c => { if(c.mount != null){ var d = c.mount; c.mount = null; if(Vars.player.unit() == d) Vars.player.clearUnit(); d.remove(); } },
     check: c => { var u = Vars.player.unit(); return u != null && u.within(c.tx*8, c.ty*8, 12); }},

    // only the mechanical drill, so the build menu does not slow you down (user 2026-11-03)
    {id: "drill", title: "드릴을 설치하세요!", sandbox: true, themes: ["desert", "cave"], allow: ["mechanical-drill"],
     plan: (c, r) => {
        c.ox = ri(r, 14, W - 7); c.oy = ri(r, 4, H - 6); c.keep = [[c.ox - 3, c.oy - 3, c.ox + 4, c.oy + 4]];
        // hard (user 2026-11-03): a wall on one of the four ore tiles, so one drill cannot cover the rest; every ore tile must be under a drill
        if(c.hard){ c.block = Math.floor(r()*4); c.title = "드릴을 설치하세요! (하드)"; }
     },
     place: (c, r) => {
        c.ores = [];
        for(var k = 0; k < 4; k++){
            var x = c.ox + (k % 2), y = c.oy + Math.floor(k/2);
            if(c.hard && k == c.block){ T(x, y).setBlock(wallFor(c)); continue; }
            T(x, y).setOverlay(B.oreCopper); c.ores.push([x, y]);
        }
     },
     start: c => {},
     check: c => c.hard
        ? c.ores.every(p => { var t = T(p[0], p[1]); return t != null && t.build != null && String(t.build.block.name).indexOf("drill") >= 0; })
        : c.ores.some(p => { var t = T(p[0], p[1]); return t != null && t.build != null && String(t.build.block.name).indexOf("drill") >= 0; })},   // on the copper ore: sand floors are minable too (user 2026-11-03)

    {id: "conveyor", title: "컨베이어를 연결하세요!", sandbox: true, themes: ["factory", "cave"],
     allow: ["conveyor"],   // no bridges over the walls (user 2026-11-03)
     plan: (c, r) => {
        if(c.hard){   // walls across the way, so the belt has to zigzag (user 2026-11-03)
            c.shape = "rect";
            var y = ri(r, 5, H - 6), sx = ri(r, 10, 12), gap = Math.min(ri(r, 10, 14), W - 10 - sx);
            c.y1 = c.y2 = y; c.sx = sx; c.ex = sx + gap + 1;
            c.keep = [[7, y - 4, Math.min(W - 2, c.ex + 6), y + 4]];
        }else{
            var y1 = ri(r, 4, H - 5), y2 = r() < 0.5 ? y1 : Math.max(3, Math.min(H - 5, y1 + (r() < 0.5 ? -1 : 1)*ri(r, 2, 4)));
            c.y1 = y1; c.y2 = y2; c.sx = ri(r, 11, 13); c.ex = c.sx + ri(r, 3, 7) + 1;
            c.keep = [[7, Math.min(y1, y2) - 2, Math.min(W - 2, c.ex + 6), Math.max(y1, y2) + 3]];
        }
        c.endX = Math.min(W - 5, c.ex + 3);
        if(c.hard) c.title = "컨베이어를 연결하세요! (하드)";
     },
     place: (c, r) => {
        T(8, c.y1).setBlock(B.itemSource, Team.sharded);
        for(var x = 9; x <= c.sx; x++) T(x, c.y1).setBlock(B.conveyor, Team.sharded, 0);
        for(var x2 = c.ex; x2 <= c.endX; x2++) T(x2, c.y2).setBlock(B.conveyor, Team.sharded, 0);
        T(c.endX + 1, c.y2).setBlock(B.container, Team.sharded);
        var wall = wallFor(c), y = c.y1;
        if(c.hard){
            // seal everything above and below the tunnel, wall to wall, so the belt cannot go around it (user 2026-11-03)
            for(var hx = 7; hx <= Math.min(W - 2, c.endX + 2); hx++) for(var hy = 1; hy < H - 1; hy++){
                if(hy > y - 4 && hy < y + 4){ clearDecor(hx, hy); continue; }
                var ht = T(hx, hy); if(ht != null && ht.build == null) ht.setBlock(wall);
            }
            for(var k = 0, sx2 = c.sx + 2; sx2 < c.ex - 1; k++, sx2 += 3){   // posts from top and bottom in turn
                for(var yy = (k % 2 == 0 ? y - 3 : y - 1); yy <= (k % 2 == 0 ? y + 1 : y + 3); yy++) T(sx2, yy).setBlock(wall);
            }
        }else if(c.y1 == c.y2 && c.ex - c.sx >= 6 && r() < 0.6) T(c.sx + Math.floor((c.ex - c.sx)/2), y).setBlock(wall);   // a rock in the way
        c.from = [c.sx, c.y1]; c.to = [c.ex, c.y2];
        var s = T(8, c.y1); if(s.build != null) s.build.outputItem = I.copper;
        protect(c, 8, c.y1); protect(c, c.endX + 1, c.y2);   // the given blocks stay (user 2026-11-04)
        for(var gx = 9; gx <= c.sx; gx++) protect(c, gx, c.y1);
        for(var gx2 = c.ex; gx2 <= c.endX; gx2++) protect(c, gx2, c.y2);
        // the belt must come into the first belt of the far line: enemy mines on the other sides, so it cannot join further along (user 2026-11-03)
        var mines = [[c.endX + 2, c.y2], [c.endX + 1, c.y2 - 1], [c.endX + 1, c.y2 + 1]];
        for(var mx = c.ex + 1; mx <= c.endX; mx++){ mines.push([mx, c.y2 - 1]); mines.push([mx, c.y2 + 1]); }
        mines.forEach(p => { var mt = T(p[0], p[1]); if(mt != null && mt.block() == B.air && mt.build == null) mt.setBlock(B.shockMine, Team.crux); });
     },
     start: c => {},
     check: c => connected(c.from, c.to)},

    // by hand, not belts: belts were too slow for the pace (user 2026-11-03). The unit always carries 10 copper; drop it into all three.
    // hard (user 2026-11-03): three single conveyors instead of containers, a smaller target; each counts once it has held an item
    {id: "boxes", title: "상자 3개에 구리를 넣으세요!", sandbox: true, themes: ["factory", "desert"],
     plan: (c, r) => { c.boxes = [[ri(r, 12, 16), ri(r, 2, 5)], [ri(r, 18, 24), ri(r, CY - 1, CY)], [ri(r, 26, W - 5), ri(r, H - 6, H - 4)]];
        if(r() < 0.5) c.boxes.forEach(p => p[1] = H - 1 - p[1] - 1);   // mirrored half the time
        c.rots = c.boxes.map(p => Math.floor(r()*4));
        if(c.hard) c.title = "컨베이어에 구리를 넣으세요! (하드)";
        c.keep = c.boxes.map(p => [p[0] - 1, p[1] - 1, p[0] + 2, p[1] + 2]); },
     place: (c, r) => c.boxes.forEach((p, i) => T(p[0], p[1]).setBlock(c.hard ? B.conveyor : B.container, Team.sharded, c.hard ? c.rots[i] : 0)),
     start: c => { c.got = c.boxes.map(p => false); },
     tick: c => { var u = Vars.player.unit(); if(u != null && u.type != U.block && (u.stack.item != I.copper || u.stack.amount != 10)) u.stack.set(I.copper, 10); },
     check: c => { c.boxes.forEach((p, i) => { var t = T(p[0], p[1]); if(t != null && t.build != null && t.build.items != null && t.build.items.total() > 0) c.got[i] = true; });
        return c.got.every(x => x); }},

    // hard (user 2026-11-03): connect, then fire the generator with the coal the unit carries (always 10) until the lamp by the battery lights
    {id: "power", title: "전력을 연결하세요!", sandbox: true, themes: ["factory", "cave"], allow: ["power-node"],
     plan: (c, r) => { c.g = [ri(r, 9, 12), ri(r, 3, H - 4)]; c.b = [ri(r, W - 9, W - 5), ri(r, 3, H - 4)];   // farther apart than one node reaches
        c.keep = [[c.g[0] - 1, c.g[1] - 1, c.g[0] + 1, c.g[1] + 1], [c.b[0] - 1, c.b[1] - 1, c.b[0] + 2, c.b[1] + 1]];
        if(c.hard) c.title = "조명을 켜세요! (하드)"; },
     place: (c, r) => { T(c.g[0], c.g[1]).setBlock(B.combustionGenerator, Team.sharded); T(c.b[0], c.b[1]).setBlock(B.battery, Team.sharded);
        if(c.hard) T(c.b[0] + 1, c.b[1]).setBlock(B.illuminator, Team.sharded);
        // a friend built a node over the generator (user 2026-11-04): the given blocks come back the moment they are replaced or broken
        protect(c, c.g[0], c.g[1]); protect(c, c.b[0], c.b[1]); if(c.hard) protect(c, c.b[0] + 1, c.b[1]); },   // a battery links to the block beside it
     start: c => {},
     tick: c => { if(!c.hard) return; var u = Vars.player.unit(); if(u != null && u.type != U.block && (u.stack.item != I.coal || u.stack.amount != 10)) u.stack.set(I.coal, 10); },
     check: c => { var g = T(c.g[0], c.g[1]).build, b = T(c.b[0], c.b[1]).build;
        var linked = g != null && b != null && g.power != null && b.power != null && g.power.graph == b.power.graph;
        if(!c.hard || !linked) return linked;
        var l = T(c.b[0] + 1, c.b[1]).build;
        return l != null && l.power != null && l.power.graph == g.power.graph && l.power.status > 0.01 && g.productionEfficiency > 0; }},

    // replaces "fill the Duo". A player can take control of a turret or a router (ControlBlock).
    // the router was the harder one to see on the floor (user 2026-11-03): normal enters a Duo, hard the router
    {id: "router", title: "듀오에 들어가세요!", sandbox: true, themes: ["grass", "spore", "desert", "snow", "cave"],   // normal: any theme but metal (user 2026-11-03)
     plan: (c, r) => { c.rx = ri(r, 18, W - 4); c.ry = ri(r, 3, H - 4); c.keep = [[c.rx - 1, c.ry - 1, c.rx + 1, c.ry + 1]];
        if(c.hard){ c.title = "분배기에 들어가세요! (하드)"; c.theme = "factory"; } },   // hard: always on metal floor, where the router is hard to spot (user 2026-11-03)
     place: (c, r) => { T(c.rx, c.ry).setBlock(c.hard ? B.router : B.duo, Team.sharded); protect(c, c.rx, c.ry); },
     start: c => {},
     check: c => { var u = Vars.player.unit(); if(u == null || u.type != U.block) return false; var b = u.tile(); return b != null && b.tile.x == c.rx && b.tile.y == c.ry; }},

    {id: "crawler", title: "크롤러를 자폭시키세요!", sandbox: true, themes: ["grass", "spore"],
     plan: (c, r) => {
        c.wx = W - ri(r, 7, 9); c.wy = ri(r, 3, H - 6);
        c.keep = [[c.wx - 2, c.wy - 2, c.wx + 4, c.wy + 4]];
        // hard: three by the core, one near the enemy walls but out of its reach (range 5 tiles, blast 7), so it needs an order
        c.spawns = c.hard ? [[8, CY - 1], [8, CY], [8, CY + 1], [c.wx - 12, c.wy + 1]] : [[8, CY]];
        if(c.hard){ c.keep.push([c.wx - 13, c.wy, c.wx - 11, c.wy + 2]); c.title = "크롤러를 자폭시키세요! (하드)"; }
     },
     place: (c, r) => {
        var path = THEMES[c.theme].path, x0 = 5, y1 = c.wy + 1, n = Math.max(1, c.wx - x0);   // a dirt track to the enemy walls (user's picture)
        if(path) for(var i = 0; i <= n; i++){
            var px = x0 + i, py = Math.round(CY + (y1 - CY)*i/n + (r() - 0.5)*1.5);
            for(var dy = -1; dy <= 1; dy++){ var t = T(px, py + dy); if(t != null && t.block() == B.air && t.build == null) t.setFloor(path[Math.floor(r()*path.length)]); }
        }
        for(var x = c.wx; x < c.wx + 3; x++) for(var y = c.wy; y < c.wy + 3; y++) T(x, y).setBlock(B.copperWall, Team.crux);
     },
     start: c => { c.dead = 0; c.far = null; c.lastOwn = null;
        c.spawns.forEach((p, i) => { var u = U.crawler.spawn(Team.sharded, p[0]*8, p[1]*8); if(c.hard && i == 3) c.far = u; }); },
     // hard: the far crawler goes by order only; taking control of it puts the player back (user 2026-11-03)
     tick: c => {
        var u = Vars.player.unit(); if(c.far == null || u == null) return;
        if(u != c.far){ if(!Vars.player.dead()) c.lastOwn = u; return; }
        var back = c.lastOwn;
        if(back != null && back.isAdded() && back.team == Team.sharded && back != c.far) Vars.player.unit(back); else Vars.player.clearUnit();
        try{ c.far.resetController(); }catch(e){}
        Vars.ui.showInfoToast("이 크롤러는 직접 조종할 수 없어요. 명령으로 보내세요!", 1.5);
     },
     check: c => c.dead >= c.spawns.length},

    // chain (user 2026-11-03): mine copper -> build a Duo -> stop the daggers, with the copper you mined. Building costs a quarter here.
    // hard asked copper, lead, sand: sand floors are playerUnmineable in v146, so scrap stands in for sand
    {id: "mine", title: "구리를 캐세요!", sandbox: false, cost: 0.25, themes: ["cave", "snow"],
     plan: (c, r) => {
        c.items = c.hard ? ["copper", "lead", "scrap"] : ["copper"]; c.patches = [];
        var xs = c.hard ? [ri(r, 10, 12), ri(r, 16, 19), ri(r, 23, 26)] : [ri(r, 12, 18)];
        c.items.forEach((it, i) => c.patches.push([xs[i], ri(r, 3, H - 7)]));
        c.keep = c.patches.map(p => [p[0] - 1, p[1] - 1, p[0] + 4, p[1] + 4]);
        if(c.hard) c.title = "구리, 납, 고철을 캐세요! (하드)";
     },
     place: (c, r) => c.items.forEach((it, i) => { var p = c.patches[i];
        for(var x = p[0]; x < p[0] + 4; x++) for(var y = p[1]; y < p[1] + 4; y++) T(x, y).setOverlay(Vars.content.block("ore-" + it)); }),
     start: c => { var core = Vars.player.team().core(); c.core0 = {}; c.items.forEach(it => c.core0[it] = core == null ? 0 : Number(core.items.get(Vars.content.item(it)))); },
     // what reached the core plus what the unit still carries: mined items go straight to the core when it is in range (MinerComp)
     check: c => { var core = Vars.player.team().core(), u = Vars.player.unit(); if(core == null) return false;
        c.mined = {};
        return c.items.map(it => { var item = Vars.content.item(it), held = (u != null && u.stack != null && u.stack.item == item) ? Number(u.stack.amount) : 0;
            c.mined[it] = Math.max(0, Number(core.items.get(item)) - c.core0[it] + held); return c.mined[it] >= 1; }).every(x => x); }},   // one of each (user 2026-11-05)

    {id: "build-duo", title: "듀오를 건설하세요!", chain: true, sandbox: false, cost: 0.25, allow: ["duo"], themes: ["cave", "snow"],
     plan: (c, r) => { c.keep = []; }, place: (c, r) => {},   // practice only: a room of its own
     // the ore goes once mining is done, and the core holds 100 copper: 10 mined was not enough for two Duos in hard (user 2026-11-03)
     start: c => { (c.patches || []).forEach(p => { for(var x = p[0]; x < p[0] + 4; x++) for(var y = p[1]; y < p[1] + 4; y++){ var t = T(x, y); if(t != null && t.overlay() != B.air) t.setOverlay(B.air); } });
        redrawFloor(); holdCopper(100);
        c.duos0 = teamBuilds(b => b.block == B.duo).length; c.need = c.hard ? 2 : 1; if(c.hard) c.title = "듀오를 건설하세요! (하드)"; },
     tick: c => holdCopper(100),
     check: c => teamBuilds(b => b.block == B.duo).length - c.duos0 >= c.need},

    {id: "daggers", title: "대거를 막으세요!", chain: true, sandbox: false, cost: 0.25, themes: ["cave", "snow"],
     plan: (c, r) => { c.keep = [[11, CY - 2, 14, CY + 2]]; },
     place: (c, r) => { T(12, CY).setBlock(B.duo, Team.sharded, 0); if(c.hard) T(12, CY - 2).setBlock(B.duo, Team.sharded, 0); },   // practice only: the Duos are given
     // daggers have 1 hp and do not shoot; Duos fire only while the player controls one; the player's own gun is off (user 2026-11-03)
     start: c => { c.daggersDead = 0; c.daggers = c.hard ? 4 : 2; if(c.hard) c.title = "대거를 막으세요! (하드)";
        // inside the Duos' reach wherever they were built (Duo range ~13 tiles; a Duo by the core left the daggers out of range, user 2026-11-03)
        var duos = teamBuilds(b => b.block == B.duo);
        for(var i = 0; i < c.daggers; i++){
            var p = daggerSpot(duos.length > 0 ? duos[i % duos.length] : null, i), d = U.dagger.spawn(Team.crux, p[0]*8, p[1]*8);
            d.health = 1; d.apply(SE.disarmed, 1e7);
        } },
     tick: c => {
        holdCopper(100);   // user 2026-11-03
        if(!c.hard) teamBuilds(b => b.block == B.duo).forEach(b => {   // normal: the Duos load themselves, no ammo step (user 2026-11-03)
            for(var k = 0; k < 40 && b.acceptItem(b, I.copper); k++) b.handleItem(b, I.copper);
        });
        teamBuilds(b => b.block == B.duo).forEach(b => { if(!b.isControlled()){ b.logicControlTime = 30; b.logicShooting = false; } });   // logic-held and not shooting
        var u = Vars.player.unit(); if(u != null && u.type != U.block) u.apply(SE.disarmed, 5);
     },
     check: c => c.daggersDead >= c.daggers},

    // ---- 0.8 stages (user 2026-11-03) ----
    {id: "switch", title: "스위치를 켜세요!", sandbox: true, themes: ["factory", "grass"],
     plan: (c, r) => {
        c.sw = c.hard ? [[ri(r, 12, 15), ri(r, 2, 4)], [ri(r, 18, 22), ri(r, H - 5, H - 3)], [ri(r, 24, 28), ri(r, 2, 4)], [ri(r, 30, W - 3), ri(r, H - 5, H - 3)]]
                      : [[ri(r, 18, W - 4), ri(r, 3, H - 4)]];
        c.keep = c.sw.map(p => [p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1]);
        if(c.hard) c.title = "스위치를 켜세요! (하드)";
     },
     place: (c, r) => c.sw.forEach(p => { var t = T(p[0], p[1]); t.setBlock(B.switchBlock, Team.sharded); if(t.build != null) t.build.enabled = false; protect(c, p[0], p[1]); }),
     start: c => {},
     check: c => c.sw.every(p => { var t = T(p[0], p[1]); return t != null && t.build != null && t.build.block == B.switchBlock && t.build.enabled; })},

    // walls wall to wall with one door each; open it and walk through to the marked square
    {id: "door", title: "문을 여세요!", sandbox: true, themes: ["factory", "snow"],
     plan: (c, r) => {
        c.shape = "rect"; c.lines = [ri(r, 16, 22)];   // one door in both modes; normal has the large (2x2) door, hard the small one (user 2026-11-04)
        c.doors = c.lines.map(x => [x, ri(r, 3, H - 5)]);
        c.tx = W - 4; c.ty = ri(r, 4, H - 5); c.keep = [[c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2]];
        if(c.hard) c.title = "문을 여세요! (하드)";
     },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        var wall = wallFor(c);
        // no decoration at all here: a piece beside a door shut the only way (user 2026-11-04). The room is a plain rectangle, so the interior is decoration only.
        for(var ix = 1; ix <= W - 2; ix++) for(var iy = 1; iy <= H - 2; iy++) if(!isCoreTile(ix, iy)) clearDecor(ix, iy);
        var big = !c.hard, thick = big ? 2 : 1;
        c.doors.forEach(d => {
            for(var dx = 0; dx < thick; dx++) for(var y = 1; y < H - 1; y++){
                if(y == d[1] || (big && y == d[1] + 1)) continue;
                var t = T(d[0] + dx, y); if(t.build == null) t.setBlock(wall);
            }
            T(d[0], d[1]).setBlock(big ? B.doorLarge : B.door, Team.sharded); protect(c, d[0], d[1]);
        });
     },
     // the core unit floats over walls in this build, so the player walks a Dagger (5x, like hard move) (user 2026-11-03)
     start: c => mountPlayer(c, U.dagger, true),
     tick: c => keepMount(c),
     leave: c => unmount(c),
     check: c => { var u = Vars.player.unit(); return u != null && u.type != U.block && u.within(c.tx*8, c.ty*8, 12); }},

    // a belt turned the wrong way: build over it facing the container (that is how a placed block turns)
    {id: "rotate", title: "컨베이어를 돌리세요!", sandbox: true, themes: ["factory", "desert"], allow: ["conveyor"],
     plan: (c, r) => {
        c.sets = c.hard ? [[ri(r, 12, 15), ri(r, 3, 5)], [ri(r, 19, 23), ri(r, CY - 1, CY + 1)], [ri(r, 27, W - 6), ri(r, H - 6, H - 4)]] : [[ri(r, 16, W - 7), ri(r, 3, H - 5)]];
        c.rots = c.sets.map(p => [1, 2, 3][Math.floor(r()*3)]);   // never already right
        c.keep = c.sets.map(p => [p[0] - 2, p[1] - 2, p[0] + 3, p[1] + 2]);
        if(c.hard) c.title = "컨베이어를 돌리세요! (하드)";
     },
     place: (c, r) => c.sets.forEach((p, i) => {
        T(p[0] - 1, p[1]).setBlock(B.itemSource, Team.sharded); var sb = T(p[0] - 1, p[1]).build; if(sb != null) sb.outputItem = I.copper;
        T(p[0], p[1]).setBlock(B.conveyor, Team.sharded, c.rots[i]);
        T(p[0] + 1, p[1]).setBlock(B.container, Team.sharded);
        protect(c, p[0] - 1, p[1]); protect(c, p[0] + 1, p[1]);
     }),
     start: c => { c.got = c.sets.map(p => false); },
     // success the moment every belt faces its container; waiting for an item was slower (user 2026-11-03)
     check: c => c.sets.every(p => { var t = T(p[0], p[1]); return t != null && t.build != null && String(t.build.block.name).indexOf("conveyor") >= 0 && t.build.rotation == 0; })},

    // take lead out of the core and drop it in the container (hard: three items, each container already holds one of its own)
    // 0.9.1 (user 2026-11-03): "boxes" and "core-take" merged: take items out of the core and carry them to the container.
    // hard: three items, each container labelled by filters set to its item beside it (the pre-filled item could not be seen)
    {id: "core-take", title: "코어에서 상자로 옮기세요!", sandbox: true, themes: ["factory", "cave"],
     plan: (c, r) => {
        c.items = c.hard ? ["lead", "coal", "sand"] : ["lead"];
        c.boxes = c.hard ? [[ri(r, 12, 15), ri(r, 2, 4)], [ri(r, 18, 22), ri(r, H - 6, H - 4)], [ri(r, 25, W - 5), ri(r, 3, 6)]] : [[ri(r, 14, W - 5), ri(r, 3, H - 5)]];
        c.keep = c.boxes.map(p => [p[0] - 2, p[1] - 1, p[0] + 2, p[1] + 2]);
        if(c.hard) c.title = "코어에서 상자로 옮기세요! (하드)";
     },
     place: (c, r) => c.boxes.forEach((p, i) => { T(p[0], p[1]).setBlock(B.container, Team.sharded); protect(c, p[0], p[1]);
        if(!c.hard) return;
        for(var dy = 0; dy < 2; dy++){ var ft = T(p[0] - 1, p[1] + dy); ft.setBlock(B.sorter, Team.sharded); if(ft.build != null) ft.build.sortItem = Vars.content.item(c.items[i]); protect(c, p[0] - 1, p[1] + dy); } }),
     start: c => { var core = Vars.player.team().core(); if(core != null) c.items.forEach(it => core.items.set(Vars.content.item(it), 100)); },
     // 0.9.12 (user 2026-11-04): core stock of these items stays at 100 the whole stage
     tick: c => { var core = Vars.player.team().core(); if(core == null) return; c.items.forEach(it => { var item = Vars.content.item(it); if(core.items.get(item) != 100) core.items.set(item, 100); }); },
     check: c => c.boxes.every((p, i) => { var t = T(p[0], p[1]); return t != null && t.build != null && t.build.items != null && t.build.items.get(Vars.content.item(c.items[i])) >= 1; })},

    // the ending (user 2026-11-04): a long straight run, narrowing to the reactor at the far end, in a 10x Dagger.
    // the Dagger carries 10 thorium to put in it; hard adds a few posts (not a tight zigzag).
    {id: "reactor", title: "토륨 원자로를 폭발시키세요!", sandbox: true, themes: ["desert", "cave"],
     plan: (c, r) => { c.shape = "rect"; c.bx = WW - 6; c.by = CY; c.keep = []; if(c.hard) c.title = "토륨 원자로를 폭발시키세요! (하드)"; },
     place: (c, r) => {
        var wall = wallFor(c), fl = THEMES[c.theme].floor[0];
        function half(x){ return Math.max(2, Math.round(7 - 5*(x - 5)/(WW - 12))); }
        for(var x = 1; x <= WW - 2; x++) for(var y = 1; y <= H - 2; y++){
            if(isCoreTile(x, y)) continue;
            var inside = x <= WW - 3 && ((x <= 5 && Math.abs(y - CY) <= 3) || (x >= 5 && Math.abs(y - CY) <= half(x)));
            var t = T(x, y);
            if(inside){ if(t.build == null && t.block() != B.air) t.setAir(); if(x >= W - 1){ t.setFloor(fl); if(t.overlay() != B.air) t.setOverlay(B.air); } }
            else if(t.build == null && t.block() == B.air) t.setBlock(wall);
        }
        if(c.hard) [24, 42, 60, 78].forEach((px, k) => {   // posts from top and bottom in turn, each leaving a gap
            var h = half(px);
            for(var y = CY - h; y <= CY + h; y++){
                if(k % 2 == 0 ? y < CY - h + 3 : y > CY + h - 3) continue;   // a 3-tile gap (user 2026-11-04)
                var pt = T(px, y); if(pt.build == null) pt.setBlock(wall);
            }
        });
        T(c.bx, c.by).setBlock(B.thoriumReactor, Team.sharded);
        var b = T(c.bx, c.by).build; if(b != null) b.heat = 0.997;   // right at the edge: it blows at 0.999 (user 2026-11-04: heating up took a while)
     },
     start: c => { c.item = Vars.content.item("thorium"); mountPlayer(c, U.dagger, FAST10); },
     tick: c => {
        keepMount(c);
        var u = Vars.player.unit(), b = T(c.bx, c.by).build;
        if(b == null || b.block != B.thoriumReactor) return;
        // both modes: carry 10 thorium and put it in yourself; just running up was dull (user 2026-11-04)
        if(u != null && u.type != U.block && (u.stack.item != c.item || u.stack.amount != 10)) u.stack.set(c.item, 10);
        if(b.items.get(c.item) == 0 && b.heat < 0.997) b.heat = 0.997;   // no cooling off while it waits
     },
     leave: c => unmount(c),
     check: c => { var t = T(c.bx, c.by); return t == null || t.build == null || t.build.block != B.thoriumReactor; }},

    // the filter (sorter) must let the item on its belt through to the container ahead; it cannot be removed (user 2026-11-03)
    {id: "filter", title: "필터를 설정하세요!", sandbox: true, themes: ["factory", "desert"],
     plan: (c, r) => {
        c.items = c.hard ? ["lead", "coal", "sand"] : ["copper"];
        c.rows = c.hard ? [CY - 5, CY, CY + 5] : [ri(r, 4, H - 5)];
        c.fx = ri(r, 18, 24);
        c.keep = c.rows.map(y => [9, y - 1, c.fx + 3, y + 1]);
        if(c.hard) c.title = "필터를 설정하세요! (하드)";
     },
     place: (c, r) => c.rows.forEach((y, i) => {
        T(10, y).setBlock(B.itemSource, Team.sharded); var sb = T(10, y).build; if(sb != null) sb.outputItem = Vars.content.item(c.items[i]);
        for(var x = 11; x < c.fx; x++) T(x, y).setBlock(B.conveyor, Team.sharded, 0);
        T(c.fx, y).setBlock(B.sorter, Team.sharded); T(c.fx + 1, y).setBlock(B.container, Team.sharded);
        protect(c, 10, y); protect(c, c.fx, y); protect(c, c.fx + 1, y);
        for(var x2 = 11; x2 < c.fx; x2++) protect(c, x2, y);
     }),
     start: c => {},
     check: c => c.rows.every((y, i) => { var t = T(c.fx, y); return t != null && t.build != null && t.build.sortItem == Vars.content.item(c.items[i]); })},

    // two belts cross at one empty tile: only a junction can be built
    {id: "junction", title: "교차시키세요!", sandbox: true, themes: ["factory", "cave"], allow: ["junction"],
     plan: (c, r) => {
        c.shape = "rect"; c.hy = ri(r, 6, H - 7);
        c.vx = c.hard ? [ri(r, 14, 18), ri(r, 23, 27)] : [ri(r, 16, 24)];
        c.hx0 = 10; c.hx1 = Math.max.apply(null, c.vx) + 4;
        c.keep = [[c.hx0 - 1, c.hy - 1, c.hx1 + 2, c.hy + 2]].concat(c.vx.map(x => [x - 1, 2, x + 1, H - 3]));
        if(c.hard) c.title = "교차시키세요! (하드)";
     },
     place: (c, r) => {
        var y = c.hy;
        T(c.hx0, y).setBlock(B.itemSource, Team.sharded); var sb = T(c.hx0, y).build; if(sb != null) sb.outputItem = I.copper;
        for(var x = c.hx0 + 1; x <= c.hx1; x++) if(c.vx.indexOf(x) < 0) T(x, y).setBlock(B.conveyor, Team.sharded, 0);
        T(c.hx1 + 1, y).setBlock(B.container, Team.sharded);
        c.ends = [[c.hx1 + 1, y]];
        c.vx.forEach(vx => {
            T(vx, 2).setBlock(B.itemSource, Team.sharded); var vb = T(vx, 2).build; if(vb != null) vb.outputItem = I.lead;
            for(var yy = 3; yy <= H - 5; yy++) if(yy != y) T(vx, yy).setBlock(B.conveyor, Team.sharded, 1);
            T(vx, H - 4).setBlock(B.container, Team.sharded); c.ends.push([vx, H - 4]);
        });
        for(var px = c.hx0; px <= c.hx1 + 1; px++) if(c.vx.indexOf(px) < 0) protect(c, px, y);
        c.vx.forEach(vx => { for(var py = 2; py <= H - 4; py++) if(py != y) protect(c, vx, py); });
     },
     start: c => { c.got = c.ends.map(p => false); },
     // success the moment a junction stands on every crossing; waiting for items was only slower (user 2026-11-03)
     check: c => c.vx.every(x => { var t = T(x, c.hy); return t.build != null && t.build.block == B.junction; })},

    // break the wall; hard: five in turn, the next appears somewhere else once one is gone (user 2026-11-03)
    {id: "wall", title: "벽을 부수세요!", sandbox: true, themes: ["grass", "desert"],
     plan: (c, r) => { c.spots = []; for(var i = 0; i < (c.hard ? 5 : 1); i++) c.spots.push([ri(r, 12, W - 4), ri(r, 3, H - 4)]);
        c.keep = c.spots.map(p => [p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1]); if(c.hard) c.title = "벽을 부수세요! (하드)"; },
     place: (c, r) => {},
     start: c => { c.n = 0; wallNext(c); },
     tick: c => { var p = c.spots[c.n]; if(p == null) return; var t = T(p[0], p[1]); if(t.build == null && t.block() == B.air){ c.n++; wallNext(c); } },
     check: c => c.n >= c.spots.length},

    // mechanical pump on the water, conduits to the container; hard: the sealed corridor with posts
    {id: "water", title: "물을 연결하세요!", sandbox: true, themes: ["grass", "snow"], allow: ["mechanical-pump", "conduit"],
     plan: (c, r) => {
        c.shape = "rect"; c.wy = c.hard ? ri(r, CY - 2, CY + 2) : ri(r, 4, H - 6);
        c.tank = [W - 6, c.hard ? c.wy : ri(r, 3, H - 6)];
        c.keep = [[8, c.wy - 2, 13, c.wy + 2], [c.tank[0] - 1, c.tank[1] - 1, c.tank[0] + 2, c.tank[1] + 2]];
        if(c.hard) c.title = "물을 연결하세요! (하드)";
     },
     place: (c, r) => {
        for(var x = 9; x <= 11; x++) for(var y = c.wy - 1; y <= c.wy + 1; y++) T(x, y).setFloor(B.water);
        T(c.tank[0], c.tank[1]).setBlock(B.liquidContainer, Team.sharded); protect(c, c.tank[0], c.tank[1]);
        if(!c.hard) return;
        var wall = wallFor(c), y0 = c.wy;
        for(var hx = 13; hx <= W - 2; hx++) for(var hy = 1; hy < H - 1; hy++){
            if(hy > y0 - 4 && hy < y0 + 4){ clearDecor(hx, hy); continue; }
            var ht = T(hx, hy); if(ht != null && ht.build == null) ht.setBlock(wall);
        }
        for(var k = 0, px = 15; px <= W - 9; k++, px += 3)
            for(var yy = (k % 2 == 0 ? y0 - 3 : y0 - 1); yy <= (k % 2 == 0 ? y0 + 1 : y0 + 3); yy++) T(px, yy).setBlock(wall);
     },
     start: c => {},
     check: c => { var t = T(c.tank[0], c.tank[1]); return t != null && t.build != null && t.build.liquids != null && t.build.liquids.get(Packages.mindustry.content.Liquids.water) > 0.01; }},

    // ---- 0.13 stages (user 2026-11-04): 45 in all; dull ones come out later ----
    // a plasma bore facing the beryllium in the wall; hard: two ore walls, both drilled
    {id: "plasma-bore", title: "플라즈마 굴착기를 설치하세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"], allow: ["plasma-bore"],
     plan: (c, r) => { c.shape = "rect"; c.ores = c.hard ? [[W - 6, 4], [24, H - 3]] : [[W - 8, CY + 4]];
        c.keep = c.ores.map(p => [p[0] - 7, p[1] - 3, p[0] + 2, p[1] + 3]); if(c.hard) c.title = "플라즈마 굴착기를 설치하세요! (하드)"; },
     place: (c, r) => c.ores.forEach((p, k) => {
        // a 2x3 ore wall; the second one in hard lies along the top wall, so the bore faces up
        for(var dx = 0; dx < (k == 1 ? 3 : 2); dx++) for(var dy = 0; dy < (k == 1 ? 2 : 3); dy++){
            var t = T(p[0] + dx, p[1] + dy - (k == 1 ? 0 : 1)); if(t == null) continue;
            if(t.build != null) t.setAir(); t.setBlock(B.beryllicStoneWall); t.setOverlay(B.wallOreBeryllium);
        } }),
     start: c => {},
     check: c => { var bores = teamBuilds(b => b.block == B.plasmaBore && b.facingAmount > 0);
        return c.ores.every(p => bores.some(b => { for(var i = 0; i < b.facing.length; i++){ var f = b.facing[i]; if(f != null && Math.abs(f.x - p[0]) <= 3 && Math.abs(f.y - p[1]) <= 3) return true; } return false; })); }},

    // blocks are smashed the moment the stage starts; rebuild them with the game's rebuild (B), or by hand (user 2026-11-04: in place of the blast door)
    {id: "rebuild", title: "부서진 걸 재건하세요!", sandbox: true, themes: ["factory", "grass"],
     plan: (c, r) => { c.shape = "rect";
        // [x, y, block, rotation]
        c.parts = c.hard
            ? [[18, 7, "conveyor", 0], [19, 7, "conveyor", 0], [20, 7, "router", 0], [20, 8, "conveyor", 1], [20, 9, "junction", 0], [20, 10, "conveyor", 1], [21, 7, "conveyor", 0], [22, 7, "sorter", 0],
               [23, 7, "conveyor", 3], [23, 6, "conveyor", 3], [17, 11, "titanium-wall", 0], [18, 11, "titanium-wall", 0], [22, 11, "mender", 0], [24, 10, "duo", 0]]
            : [[19, 8, "copper-wall", 0], [20, 8, "copper-wall", 0], [21, 8, "copper-wall", 0], [19, 10, "copper-wall", 0], [21, 10, "copper-wall", 0], [20, 10, "duo", 0], [22, 9, "conveyor", 0]];
        c.allow = []; c.parts.forEach(p => { if(c.allow.indexOf(p[2]) < 0) c.allow.push(p[2]); });
        c.keep = [[15, 4, 26, 13]];
        if(c.hard) c.title = "부서진 걸 재건하세요! (하드)"; },
     place: (c, r) => { for(var x = 15; x <= 26; x++) for(var y = 4; y <= 13; y++) clearDecor(x, y); },
     start: c => {
        setAllowed(c.allow);
        try{ Vars.state.rules.ghostBlocks = true; }catch(e){}
        c.parts.forEach(p => T(p[0], p[1]).setBlock(Vars.content.block(p[2]), Team.sharded, p[3]));
        c.parts.forEach(p => { var b = T(p[0], p[1]).build; if(b != null){ try{ b.kill(); }catch(e){ logErr("rebuild kill " + e); } } });   // destroyed, so the team keeps their ghosts to rebuild
     },
     leave: c => { try{ Vars.player.team().data().plans.clear(); }catch(e){} },   // no ghosts left for later stages
     check: c => c.parts.every(p => { var t = T(p[0], p[1]), b = t == null ? null : t.build;
        if(b == null || b.team != Team.sharded || String(b.block.name) != p[2]) return false;
        return !rotMatters(b.block) || b.rotation == p[3]; })},

    // (not in the run since 0.13.9, user 2026-11-04) Erekir blast doors open by themselves for a ground unit nearby; walk the Dagger through. hard: three walls
    {id: "blast-door", title: "방폭문을 지나가세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"],
     plan: (c, r) => { c.shape = "rect"; c.lines = c.hard ? [[12, 3], [20, H - 5], [27, CY]] : [[18, CY - 1]];
        c.tx = W - 4; c.ty = c.hard ? 4 : CY; c.keep = [[c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2]];
        if(c.hard) c.title = "방폭문을 지나가세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        for(var ix = 1; ix <= W - 2; ix++) for(var iy = 1; iy <= H - 2; iy++) if(!isCoreTile(ix, iy)) clearDecor(ix, iy);
        var wall = wallFor(c);
        c.lines.forEach(d => {
            for(var dx = 0; dx < 2; dx++) for(var y = 1; y < H - 1; y++){ if(y == d[1] || y == d[1] + 1) continue; var t = T(d[0] + dx, y); if(t.build == null) t.setBlock(wall); }
            T(d[0], d[1]).setBlock(B.blastDoor, Team.sharded); protect(c, d[0], d[1]);
        });
     },
     start: c => mountPlayer(c, U.dagger, true),
     tick: c => keepMount(c),
     leave: c => unmount(c),
     check: c => { var u = Vars.player.unit(); return u != null && u.type != U.block && u.within(c.tx*8, c.ty*8, 12); }},

    // copy the structure by the core (F: copy, then paste) and build the same beyond the wall (user 2026-11-04: in place of the ducts)
    {id: "copy", title: "똑같이 지으세요!", sandbox: true, themes: ["factory", "desert"],
     plan: (c, r) => { c.shape = "rect"; c.wx = 17;
        // [dx, dy, block, rotation] from the structure's corner
        c.parts = c.hard
            ? [[0, 0, "conveyor", 0], [1, 0, "conveyor", 0], [2, 0, "router", 0], [2, 1, "conveyor", 1], [2, 2, "sorter", 0], [3, 0, "conveyor", 0], [4, 0, "conveyor", 3], [4, -1, "conveyor", 3],
               [0, 2, "titanium-wall", 0], [1, 2, "titanium-wall", 0], [3, 2, "mender", 0], [4, 2, "duo", 0]]
            : [[0, 0, "copper-wall", 0], [1, 0, "copper-wall", 0], [2, 0, "copper-wall", 0], [0, 2, "copper-wall", 0], [2, 2, "copper-wall", 0], [1, 2, "duo", 0], [3, 1, "conveyor", 0]];
        c.ox = 9; c.oy = CY + 2;
        c.allow = []; c.parts.forEach(p => { if(c.allow.indexOf(p[2]) < 0) c.allow.push(p[2]); });
        c.keep = [[c.ox - 1, c.oy - 2, c.ox + 5, c.oy + 3], [c.wx + 2, 3, W - 3, H - 4]];
        if(c.hard) c.title = "똑같이 지으세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.ox - 1; x <= c.ox + 5; x++) for(var y = c.oy - 2; y <= c.oy + 3; y++) clearDecor(x, y);
        for(var y2 = 1; y2 <= H - 2; y2++){ clearDecor(c.wx, y2); T(c.wx, y2).setBlock(wallFor(c)); }
        c.parts.forEach(p => { T(c.ox + p[0], c.oy + p[1]).setBlock(Vars.content.block(p[2]), Team.sharded, p[3]); protect(c, c.ox + p[0], c.oy + p[1]); });
     },
     start: c => setAllowed(c.allow),
     // everything the player built past the wall, moved to its corner, must be the same set as the sample (any place, nothing extra)
     // 0.13.11: the sample found anywhere past the wall at one offset (extra blocks no longer spoil it); a miss is logged once per change, to see why (user 2026-11-04: it never cleared)
     check: c => {
        var got = {}, list = teamBuilds(b => b.tile.x > c.wx);
        list.forEach(b => { got[b.tile.x + "," + b.tile.y] = [String(b.block.name), rotMatters(b.block) ? Number(b.rotation) : 0]; });
        var rotOf = p => rotMatters(Vars.content.block(p[2])) ? p[3] : 0, p0 = c.parts[0];
        var hit = list.some(b => { if(String(b.block.name) != p0[2]) return false; var ox = b.tile.x - p0[0], oy = b.tile.y - p0[1];
            return c.parts.every(p => { var g = got[(ox + p[0]) + "," + (oy + p[1])]; return g != null && g[0] == p[2] && g[1] == rotOf(p); }); });
        if(!hit){ var sig = list.length + ":" + list.map(b => b.tile.x + "," + b.tile.y + "," + b.block.name + "," + (rotMatters(b.block) ? b.rotation : 0)).join(" ");
            if(sig != c.lastSig){ c.lastSig = sig; if(list.length >= c.parts.length) logErr("copy miss " + sig); } }
        return hit;
     }},

    // (not in the run since 0.13.9, user 2026-11-04) ducts instead of belts; hard: a thick wall across, so a duct bridge goes over it
    {id: "duct", title: "덕트를 연결하세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"], allow: ["duct", "duct-bridge"],
     plan: (c, r) => { c.shape = "rect"; c.src = [9, c.hard ? CY : 5]; c.dst = [W - 7, c.hard ? CY + 3 : H - 6]; c.wx = 20;
        c.keep = [[c.src[0] - 1, c.src[1] - 1, c.src[0] + 1, c.src[1] + 1], [c.dst[0] - 1, c.dst[1] - 1, c.dst[0] + 2, c.dst[1] + 2]];
        if(c.hard) c.title = "덕트를 연결하세요! (하드)"; },
     place: (c, r) => {
        T(c.src[0], c.src[1]).setBlock(B.itemSource, Team.sharded); var sb = T(c.src[0], c.src[1]).build; if(sb != null) sb.outputItem = I.beryllium;
        T(c.dst[0], c.dst[1]).setBlock(B.container, Team.sharded);
        protect(c, c.src[0], c.src[1]); protect(c, c.dst[0], c.dst[1]);
        if(c.hard) for(var dx = 0; dx < 2; dx++) for(var y = 1; y <= H - 2; y++){ clearDecor(c.wx + dx, y); T(c.wx + dx, y).setBlock(wallFor(c)); }
     },
     start: c => {},
     check: c => boxGot(c.dst)},

    // a bridge conveyor over deep water; hard: a wider river with one island in the middle
    {id: "bridge", title: "다리를 놓으세요!", sandbox: true, themes: ["grass", "snow"], allow: ["conveyor", "bridge-conveyor"],
     plan: (c, r) => { c.shape = "rect"; c.src = [9, CY + 2]; c.dst = [W - 6, CY + 2]; c.rx0 = 16; c.rx1 = c.hard ? 22 : 18; c.isle = c.hard ? 19 : -1;
        c.keep = [[c.src[0] - 1, c.src[1] - 1, c.src[0] + 1, c.src[1] + 1], [c.dst[0] - 1, c.dst[1] - 1, c.dst[0] + 2, c.dst[1] + 2], [c.rx0, 1, c.rx1, H - 2]];
        if(c.hard) c.title = "다리를 놓으세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.rx0; x <= c.rx1; x++) for(var y = 1; y <= H - 2; y++){ var t = T(x, y); if(t.build == null && t.block() != B.air) t.setAir(); t.setFloor(x == c.isle && Math.abs(y - c.src[1]) <= 1 ? B.sandWater : B.deepwater); }
        T(c.src[0], c.src[1]).setBlock(B.itemSource, Team.sharded); var sb = T(c.src[0], c.src[1]).build; if(sb != null) sb.outputItem = I.copper;
        T(c.dst[0], c.dst[1]).setBlock(B.container, Team.sharded);
        protect(c, c.src[0], c.src[1]); protect(c, c.dst[0], c.dst[1]);
     },
     start: c => {},
     // success the moment a chain of linked bridges spans the water; waiting for the items took too long (user 2026-11-04)
     check: c => boxGot(c.dst) || teamBuilds(b => b.block == B.itemBridge && b.tile.x < c.rx0).some(b => {
        var cur = b; for(var i = 0; i < 6; i++){ var l = Vars.world.build(Number(cur.link)); if(l == null || l.block != B.itemBridge) return false; if(l.tile.x > c.rx1) return true; cur = l; } return false; })},

    // set the unloader so only the item named by the filters beside the far container comes out
    {id: "unloader", title: "언로더를 설정하세요!", sandbox: true, themes: ["factory"],
     plan: (c, r) => { c.items = c.hard ? ["sand", "lead", "copper"] : ["coal"]; c.rows = c.hard ? [CY - 5, CY, CY + 5] : [CY + 3]; c.ux = 18;
        c.keep = c.rows.map(y => [c.ux - 3, y - 2, c.ux + 4, y + 2]); if(c.hard) c.title = "언로더를 설정하세요! (하드)"; },
     place: (c, r) => c.rows.forEach((y, i) => {
        T(c.ux - 2, y).setBlock(B.container, Team.sharded); T(c.ux, y).setBlock(B.unloader, Team.sharded); T(c.ux + 1, y).setBlock(B.container, Team.sharded);
        for(var dy = 0; dy < 2; dy++){ var ft = T(c.ux + 3, y + dy); ft.setBlock(B.sorter, Team.sharded); if(ft.build != null) ft.build.sortItem = Vars.content.item(c.items[i]); protect(c, c.ux + 3, y + dy); }
        protect(c, c.ux - 2, y); protect(c, c.ux, y); protect(c, c.ux + 1, y);
     }),
     start: c => {},
     tick: c => c.rows.forEach(y => { var b = T(c.ux - 2, y).build; if(b == null || b.items == null) return; ["coal", "sand", "lead", "copper"].forEach(n => { var it = Vars.content.item(n); if(b.items.get(it) < 50) b.items.set(it, 50); }); }),
     check: c => c.rows.every((y, i) => { var t = T(c.ux, y); return t != null && t.build != null && t.build.block == B.unloader && t.build.sortItem == Vars.content.item(c.items[i]); })},

    // a silicon smelter on the marked square, fed coal and sand and powered by what is beside it; hard: the feeds are away, belts needed
    {id: "silicon", title: "실리콘을 만드세요!", sandbox: true, themes: ["factory", "cave"],
     plan: (c, r) => { c.shape = "rect"; c.s = [18, CY + 2]; c.allow = ["silicon-smelter"];   // hard is the same as normal: belts took too long (user 2026-11-04)
        c.feeds = [[c.s[0] - 1, c.s[1], "coal"], [c.s[0] - 1, c.s[1] + 1, "sand"]];
        c.keep = [[c.s[0] - 2, c.s[1] - 1, c.s[0] + 3, c.s[1] + 2]].concat(c.feeds.map(f => [f[0] - 1, f[1] - 1, f[0] + 1, f[1] + 1]));
        if(c.hard) c.title = "실리콘을 만드세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.s[0]; x <= c.s[0] + 1; x++) for(var y = c.s[1]; y <= c.s[1] + 1; y++) T(x, y).setFloor(markFloor());
        c.feeds.forEach(f => { T(f[0], f[1]).setBlock(B.itemSource, Team.sharded); var b = T(f[0], f[1]).build; if(b != null) b.outputItem = Vars.content.item(f[2]); protect(c, f[0], f[1]); });
        T(c.s[0] + 2, c.s[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.s[0] + 2, c.s[1]);
     },
     start: c => setAllowed(c.allow),
     check: c => teamBuilds(b => b.block == B.siliconSmelter && b.items != null && b.items.get(I.silicon) > 0).length > 0},

    // lights out: light the marked square with an illuminator, powered from the source by the core
    {id: "light", title: "불을 밝히세요!", sandbox: true, themes: ["factory", "cave"], allow: ["illuminator", "power-node"],   // normal needs no nodes (0.13.10), hard does
     plan: (c, r) => { c.shape = "rect"; c.ps = [9, CY + 3]; c.tg = c.hard ? [W - 4, 2] : [24, CY - 4];
        c.keep = [[c.ps[0] - 1, c.ps[1] - 1, c.ps[0] + 1, c.ps[1] + 1], [c.tg[0] - 2, c.tg[1] - 1, c.tg[0] + 2, c.tg[1] + 2]];
        if(c.hard) c.title = "불을 밝히세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.tg[0] - 1; x <= c.tg[0] + 1; x++) for(var y = c.tg[1] - 1; y <= c.tg[1] + 1; y++){ var t = T(x, y); if(t != null && t.block() == B.air) t.setFloor(markFloor()); }
        T(c.ps[0], c.ps[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.ps[0], c.ps[1]);
     },
     start: c => darkOn(),
     // normal (user 2026-11-04): an illuminator has power the moment it is built: an unseen link to the power source, as a node's laser would make
     tick: c => { if(c.hard) return; var src = T(c.ps[0], c.ps[1]).build; if(src == null || src.power == null) return;
        teamBuilds(b => b.block == B.illuminator && b.power != null && b.power.graph != src.power.graph).forEach(b => {
            try{ if(!src.power.links.contains(b.pos())) src.power.links.add(b.pos()); if(!b.power.links.contains(src.pos())) b.power.links.add(src.pos()); src.power.graph.addGraph(b.power.graph); }catch(e){ logErr("light link " + e); }
        }); },
     leave: c => darkOff(),
     // an illuminator with power within its glow of the square
     check: c => teamBuilds(b => b.block == B.illuminator && b.efficiency > 0 && b.within(c.tg[0]*8, c.tg[1]*8, 6*8)).length > 0},

    // link the processor to the door; its code opens the door. hard: two doors
    {id: "processor", title: "프로세서를 연결하세요!", sandbox: true, themes: ["factory"],
     plan: (c, r) => { c.shape = "rect"; c.p = [14, CY + 3]; c.doors = c.hard ? [[20, 4], [19, H - 4]] : [[20, CY + 3]];
        c.keep = [[c.p[0] - 1, c.p[1] - 1, c.p[0] + 1, c.p[1] + 1]].concat(c.doors.map(d => [d[0] - 1, d[1] - 1, d[0] + 1, d[1] + 1]));
        if(c.hard) c.title = "프로세서를 연결하세요! (하드)"; },
     place: (c, r) => {
        T(c.p[0], c.p[1]).setBlock(B.microProcessor, Team.sharded);
        c.doors.forEach(d => { T(d[0], d[1]).setBlock(B.door, Team.sharded); protect(c, d[0], d[1]); });
        procCode(c); protect(c, c.p[0], c.p[1]);
     },
     start: c => procCode(c),
     tick: c => { var b = T(c.p[0], c.p[1]).build; if(b != null && b.block == B.microProcessor && String(b.code) == "") procCode(c); },   // a rebuilt processor gets its code back
     check: c => { var b = T(c.p[0], c.p[1]).build; if(b == null || b.links == null) return false;
        return c.doors.every(d => { var linked = false; b.links.each(l => { if(l.valid && l.x == d[0] && l.y == d[1]) linked = true; }); var db = T(d[0], d[1]).build; return linked && db != null && db.open; }); }},

    // build a Tsunami by the water and put out the fires; hard: the water is further, conduits needed
    {id: "tsunami", title: "불을 끄세요!", sandbox: true, armed: true, themes: ["grass", "desert"],
     plan: (c, r) => { c.shape = "rect"; c.ws = [11, CY + 3]; c.allow = ["tsunami"];
        // hard (user 2026-11-04): the same fires, but the Tsunami does not aim by itself: the player gets in and puts them out
        c.fires = [[26, 6], [27, 7], [28, 6], [27, 5], [26, 8]];
        c.keep = [[c.ws[0] - 1, c.ws[1] - 1, c.ws[0] + 4, c.ws[1] + 3]].concat(c.fires.map(f => [f[0], f[1], f[0], f[1]]));
        if(c.hard) c.title = "불을 끄세요! (하드)"; },
     place: (c, r) => { T(c.ws[0], c.ws[1]).setBlock(B.liquidSource, Team.sharded); var b = T(c.ws[0], c.ws[1]).build; if(b != null) b.source = Packages.mindustry.content.Liquids.water; protect(c, c.ws[0], c.ws[1]); },
     start: c => { setAllowed(c.allow); c.out = 0; c.ft = {}; c.doused = {};
        c.fires.forEach(f => { var t = T(f[0], f[1]); if(t.build != null || t.block() != B.air) t.setAir(); t.setFloor(B.tar); Packages.mindustry.entities.Fires.create(t); }); redrawFloor(); },   // tar under each fire (user 2026-11-04)
     // fires on bare ground burn out by themselves: hold them, unless water hit them (a jump far bigger than a frame's burning)
     // 0.13.2: the fires had burnt out before the clock started, so the stage cleared at once (user 2026-11-04): a fire that went out by itself comes back
     tick: c => { var Fs = Packages.mindustry.entities.Fires, n = 0;
        var pu = Vars.player.unit(); if(pu != null && pu.type != U.block) pu.apply(SE.disarmed, 5);   // the player's own gun stays off
        var tsu = teamBuilds(b => b.block == B.tsunami);
        if(c.hard) tsu.forEach(b => { if(!b.isControlled()){ b.logicControlTime = 30; b.logicShooting = false; } });   // hard: fires only with the player in it
        // 0.13.20: no fire counts as put out until a Tsunami stands (a frame hitch still cleared the stage at once, user 2026-11-05)
        var canDouse = tsu.length > 0;
        c.fires.forEach(f => { var k = f[0] + "," + f[1]; if(c.doused[k]){ n++; return; }
            var tile = T(f[0], f[1]), fr = Fs.get(tile); if(fr == null){ Fs.create(tile); c.ft[k] = null; return; }
            var t = Number(fr.time), was = c.ft[k];
            // 0.13.22: the jump alone still cleared fires nobody hit (user 2026-11-05): water must lie on or next to the fire too (a Tsunami shot leaves a puddle)
            if(canDouse && was != null && t - was > 12*Packages.arc.util.Time.delta && wetNear(f[0], f[1])){ fr.remove(); c.doused[k] = true; n++; return; }   // doused
            fr.time = 0; c.ft[k] = 0; });   // the field (Rhino reads fr.time as the number, user 2026-11-04)
        c.out = n; },
     check: c => c.out >= c.fires.length && teamBuilds(b => b.block == B.tsunami).length > 0},

    // ride a Poly and fly into the tier-3 maker (multiplicative reconstructor); hard: the other factories stand beside it
    {id: "poly", title: "제작기에 들어가세요!", sandbox: true, themes: ["factory"],
     plan: (c, r) => { c.shape = "rect"; c.rc = c.hard ? [W - 6, 5] : [W - 8, CY]; c.decoys = c.hard ? [[22, CY + 4, "additive-reconstructor"], [W - 6, H - 6, "air-factory"], [22, 4, "ground-factory"]] : [];
        c.keep = [[c.rc[0] - 3, c.rc[1] - 3, c.rc[0] + 3, c.rc[1] + 3]].concat(c.decoys.map(d => [d[0] - 2, d[1] - 2, d[0] + 2, d[1] + 2]));
        if(c.hard) c.title = "제작기에 들어가세요! (하드)"; },
     place: (c, r) => {
        T(c.rc[0], c.rc[1]).setBlock(B.multiplicativeReconstructor, Team.sharded, 2); protect(c, c.rc[0], c.rc[1]);
        c.decoys.forEach(d => { T(d[0], d[1]).setBlock(Vars.content.block(d[2]), Team.sharded, 2); protect(c, d[0], d[1]); });
     },
     start: c => { c.entered = false; c.inAt = 0; mountPlayer(c, U.poly, false); },
     // 0.13.6 (user 2026-11-04): only the game's own way in counts (the player puts the Poly in); the mod no longer pulls it in by itself
     tick: c => { keepMount(c); noBuild();
        var b = T(c.rc[0], c.rc[1]).build;
        if(!c.entered && b != null && b.payload != null){ c.entered = true; c.inAt = Date.now(); } },
     // the poly inside is let go with the stage: a removed reconstructor drops its payload, which left the Poly in the next room (user 2026-11-04)
     leave: c => { unmount(c); var t = T(c.rc[0], c.rc[1]); if(t != null && t.build != null && t.build.block == B.multiplicativeReconstructor){ try{ t.build.payload = null; }catch(e){} } },
     // success once the Poly has fully moved into the middle of it (user 2026-11-04)
     check: c => { if(!c.entered) return false; var b = T(c.rc[0], c.rc[1]).build; if(b == null || b.payload == null) return false;
        var arrived = false; try{ arrived = b.hasArrived() || b.payVector.len() < 1.5; }catch(e){} return arrived || Date.now() - c.inAt > 700; }},   // fully in, or a moment after going in

    // a regen projector on the marked square (power and hydrogen beside it) mends all the broken walls; hard: the square is not marked
    {id: "regen", title: "재생 프로젝터를 켜세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"], allow: ["regen-projector"],
     plan: (c, r) => { c.shape = "rect"; c.p = [16, CY + 3]; c.walls = c.hard ? [[22, 3], [26, 7], [12, H - 4], [28, H - 4], [20, H - 3], [9, 4]] : [[22, CY + 3], [24, CY + 5], [21, CY]];
        c.keep = [[c.p[0] - 3, c.p[1] - 2, c.p[0] + 3, c.p[1] + 2]].concat(c.walls.map(w => [w[0] - 1, w[1] - 1, w[0] + 1, w[1] + 1]));
        if(c.hard) c.title = "재생 프로젝터를 켜세요! (하드)"; },
     place: (c, r) => {
        if(!c.hard) for(var x = c.p[0] - 1; x <= c.p[0] + 1; x++) for(var y = c.p[1] - 1; y <= c.p[1] + 1; y++) T(x, y).setFloor(markFloor());
        T(c.p[0] - 2, c.p[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.p[0] - 2, c.p[1]);
        T(c.p[0] + 2, c.p[1]).setBlock(B.liquidSource, Team.sharded); var lb = T(c.p[0] + 2, c.p[1]).build; if(lb != null) lb.source = Packages.mindustry.content.Liquids.hydrogen; protect(c, c.p[0] + 2, c.p[1]);
        c.walls.forEach(w => { T(w[0], w[1]).setBlock(B.berylliumWall, Team.sharded); var b = T(w[0], w[1]).build; if(b != null) b.health = b.maxHealth*0.15; });
     },
     start: c => {},
     tick: c => {   // 0.13.4: no noBuild() here, the player builds the projector (user 2026-11-04: it could not be placed)
        if(teamBuilds(b => b.block == B.regenProjector && b.efficiency > 0).length == 0) return;
        c.walls.forEach(w => { var b = T(w[0], w[1]).build; if(b != null && b.damaged()) b.heal(b.maxHealth/45); }); },   // mends fast once it runs
     check: c => c.walls.every(w => { var b = T(w[0], w[1]).build; return b != null && b.block == B.berylliumWall && b.health >= b.maxHealth - 0.5; })},

    // ride an Evoke and mine beryllium out of the wall
    {id: "beryllium", title: "베릴륨을 캐세요!", sandbox: false, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"],
     // 0.13.23 (user 2026-11-05): one of each is enough; hard adds graphite (a second vein lower down)
     plan: (c, r) => { c.shape = "rect"; c.need = 1; c.veins = [[22, CY + 3, "beryllium"]].concat(c.hard ? [[22, CY - 6, "graphite"]] : []);
        c.keep = c.veins.map(v => [v[0] - 2, v[1] - 2, v[0] + 4, v[1] + 4]); if(c.hard) c.title = "베릴륨, 흑연을 캐세요! (하드)"; },
     place: (c, r) => c.veins.forEach(v => { for(var x = v[0]; x < v[0] + 3; x++) for(var y = v[1]; y < v[1] + 3; y++){ var t = T(x, y); t.setBlock(B.beryllicStoneWall); t.setOverlay(Vars.content.block("ore-wall-" + v[2])); } }),
     start: c => { mountPlayer(c, U.evoke, false); var core = Vars.player.team().core(); c.core0 = {}; c.mined = {};
        c.veins.forEach(v => c.core0[v[2]] = core == null ? 0 : Number(core.items.get(Vars.content.item(v[2])))); },
     tick: c => { keepMount(c); noBuild(); },
     leave: c => unmount(c),
     check: c => { var core = Vars.player.team().core(), u = Vars.player.unit(); if(core == null) return false;
        return c.veins.map(v => { var item = Vars.content.item(v[2]), held = (u != null && u.stack != null && u.stack.item == item) ? Number(u.stack.amount) : 0;
            c.mined[v[2]] = Math.max(0, Number(core.items.get(item)) - c.core0[v[2]] + held); return c.mined[v[2]] >= c.need; }).every(x => x); }},

    // a Nova jumps (boosts, Shift) over walls; hard: three walls
    {id: "nova", title: "노바로 벽을 넘으세요!", sandbox: true, themes: ["grass", "spore", "snow"],
     plan: (c, r) => { c.shape = "rect"; c.walls = c.hard ? [12, 20, 27] : [18]; c.tx = W - 4; c.ty = c.hard ? H - 5 : CY;
        c.keep = [[c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2]]; if(c.hard) c.title = "노바로 벽을 넘으세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        c.walls.forEach(wx => { for(var dx = 0; dx < 2; dx++) for(var y = 1; y <= H - 2; y++){ var t = T(wx + dx, y); if(t.build == null) t.setBlock(wallFor(c)); } });
     },
     start: c => { mountPlayer(c, U.nova, FAST3 != null ? FAST3 : true); Vars.ui.showInfoToast("Shift를 누르고 있으면 날아올라요!", 2.5); },
     tick: c => { keepMount(c); noBuild(); },
     leave: c => unmount(c),
     check: c => { var u = Vars.player.unit(); return u != null && u.type != U.block && u.within(c.tx*8, c.ty*8, 12); }},

    // an enemy Duo shoots at the container; a force projector beside the power must take the hits
    {id: "force", title: "보호막을 켜세요!", sandbox: true, themes: ["factory", "desert"], allow: ["force-projector"],
     plan: (c, r) => { c.shape = "rect"; c.box = [16, CY]; c.ps = [14, CY + 3]; c.duos = c.hard ? [[28, CY], [27, 3], [27, H - 4]] : [[28, CY]]; c.need = c.hard ? 15 : 6;
        c.keep = [[c.box[0] - 3, c.box[1] - 2, c.box[0] + 2, c.box[1] + 5]].concat(c.duos.map(d => [d[0] - 1, d[1] - 1, d[0] + 1, d[1] + 1]));
        if(c.hard) c.title = "보호막을 켜세요! (하드)"; },
     place: (c, r) => {
        T(c.box[0], c.box[1]).setBlock(B.container, Team.sharded); protect(c, c.box[0], c.box[1]);
        T(c.ps[0], c.ps[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.ps[0], c.ps[1]);
        c.duos.forEach(d => { T(d[0], d[1]).setBlock(B.duo, Team.crux, 2); protect(c, d[0], d[1]); });
     },
     start: c => { c.hits = 0; c.last = {}; },
     tick: c => {
        c.duos.forEach(d => { var b = T(d[0], d[1]).build; if(b == null) return; for(var k = 0; k < 10 && b.acceptItem(b, I.graphite); k++) b.handleItem(b, I.graphite); });
        teamBuilds(b => b.block == B.forceProjector).forEach(b => { var k = b.tile.x + "," + b.tile.y, was = c.last[k];
            if(was != null && b.buildup > was + 0.01 && !b.broken) c.hits++; c.last[k] = Number(b.buildup); });
     },
     check: c => c.hits >= c.need},

    // ping the enemy core (the game's ping key, P); hard: two enemy vaults that look alike stand beside it (user 2026-11-04: in place of the Breach)
    {id: "ping", title: "적 코어에 핑을 찍으세요!", sandbox: true, themes: ["desert", "cave", "snow"],
     plan: (c, r) => { c.shape = "rect"; c.core = c.hard ? [W - 6, H - 5] : [W - 7, CY]; c.decoys = c.hard ? [[W - 6, 4], [24, CY]] : [];
        c.keep = [[c.core[0] - 2, c.core[1] - 2, c.core[0] + 2, c.core[1] + 2]].concat(c.decoys.map(d => [d[0] - 2, d[1] - 2, d[0] + 2, d[1] + 2]));
        if(c.hard) c.title = "적 코어에 핑을 찍으세요! (하드)"; },
     place: (c, r) => {
        T(c.core[0], c.core[1]).setBlock(B.coreShard, Team.crux); protect(c, c.core[0], c.core[1]);
        c.decoys.forEach(d => { T(d[0], d[1]).setBlock(B.vault, Team.crux); protect(c, d[0], d[1]); });
     },
     start: c => { c.pinged = false; c.lastPing = pval("pingTime"); },
     tick: c => {
        var t = pval("pingTime");
        if(t > c.lastPing + 0.001 || (t >= 0.99 && c.lastPing < 0.99)){   // a fresh ping
            var cx = c.core[0]*8, cy = c.core[1]*8;
            if(Math.abs(pval("pingX") - cx) <= 14 && Math.abs(pval("pingY") - cy) <= 14) c.pinged = true;
        }
        c.lastPing = t;
     },
     check: c => c.pinged},

    // (not in the run since 0.13.7: the Breach turned too slowly, user 2026-11-04)
    // Erekir's Duo and daggers: put beryllium into the Breach, then (chained) stop the daggers with it
    {id: "breach-load", title: "브리치에 장전하세요!", sandbox: true, themes: ["erekir-carbon", "erekir-arkyic"],
     plan: (c, r) => breachPlan(c, "브리치에 장전하세요! (하드)"),
     place: (c, r) => breachPlace(c, false),
     start: c => {},
     tick: c => { var u = Vars.player.unit(); if(u != null && u.type != U.block && (u.stack.item != I.beryllium || u.stack.amount != 10)) u.stack.set(I.beryllium, 10); },
     check: c => { var b = T(c.br[0], c.br[1]).build; return b != null && b.block == B.breach && b.totalAmmo > 0; }},

    {id: "breach-defend", title: "적을 막으세요!", chain: true, armed: true, sandbox: true, themes: ["erekir-carbon", "erekir-arkyic"],
     plan: (c, r) => breachPlan(c, "적을 막으세요! (하드)"),   // practice only: the Breach comes loaded
     place: (c, r) => breachPlace(c, true),
     start: c => { if(c.hard) c.title = "적을 막으세요! (하드)"; c.daggersDead = 0; c.daggers = c.hard ? 4 : 2;
        for(var i = 0; i < c.daggers; i++){ var d = U.dagger.spawn(Team.crux, (24 + (i % 2)*4)*8, (c.hard ? 4 + i*3 : CY + 2*i)*8); d.health = 1; d.apply(SE.disarmed, 1e7); } },
     tick: c => {
        var b = T(c.br[0], c.br[1]).build;
        if(b != null && b.block == B.breach && !b.isControlled()){ b.logicControlTime = 30; b.logicShooting = false; }   // fires only with the player in it
        var u = Vars.player.unit(); if(u != null && u.type != U.block) u.apply(SE.disarmed, 5);
     },
     check: c => c.daggersDead >= c.daggers},

    // ---- 0.11 stages (user 2026-11-04) ----
    // beam nodes join only in straight lines; hard: an insulating (plastanium) wall with one gap the beam must go through
    {id: "beam", title: "빔 노드를 연결하세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"], allow: ["beam-node"],
     plan: (c, r) => {
        c.shape = "rect"; c.src = [9, c.hard ? 4 : 5]; c.dst = [W - 6, c.hard ? H - 5 : H - 7]; c.px = 20; c.gapY = c.hard ? 11 : -1;
        c.keep = [[c.src[0] - 1, c.src[1] - 1, c.src[0] + 1, c.src[1] + 1], [c.dst[0] - 1, c.dst[1] - 1, c.dst[0] + 2, c.dst[1] + 2]];
        if(c.hard) c.title = "빔 노드를 연결하세요! (하드)";
     },
     place: (c, r) => {
        T(c.src[0], c.src[1]).setBlock(B.powerSource, Team.sharded); protect(c, c.src[0], c.src[1]);
        T(c.dst[0], c.dst[1]).setBlock(B.electricHeater, Team.sharded); protect(c, c.dst[0], c.dst[1]);
        if(c.hard) for(var y = 1; y <= H - 2; y++){ if(y == c.gapY) continue; clearDecor(c.px, y); T(c.px, y).setBlock(B.plastaniumWall, Team.derelict); protect(c, c.px, y); }
     },
     start: c => {},
     check: c => { var a = T(c.src[0], c.src[1]).build, b = T(c.dst[0], c.dst[1]).build;
        return a != null && b != null && a.power != null && b.power != null && a.power.graph == b.power.graph; }},

    // a turbine condenser exactly over the 3x3 steam vent; then (chained) its water into the tank (user 2026-11-04)
    {id: "turbine", title: "증기 터빈을 올리세요!", sandbox: true, themes: ["erekir-carbon"], allow: ["turbine-condenser"],
     plan: (c, r) => turbinePlan(c, "증기 터빈을 올리세요! (하드)"),
     place: (c, r) => turbinePlace(c, false),
     start: c => {},
     check: c => c.vents.every(v => { var t = T(v[0], v[1]); return t != null && t.build != null && t.build.block == B.turbineCondenser && t.build.tile.x == v[0] && t.build.tile.y == v[1]; })},

    {id: "turbine-water", title: "물탱크를 채우세요!", chain: true, sandbox: true, themes: ["erekir-carbon"], allow: ["reinforced-conduit"],
     plan: (c, r) => turbinePlan(c, "물탱크를 채우세요! (하드)"),   // practice only: the turbines are given
     place: (c, r) => turbinePlace(c, true),
     start: c => { if(c.hard) c.title = "물탱크를 채우세요! (하드)"; },
     check: c => { var t = T(c.tank[0], c.tank[1]); return t != null && t.build != null && t.build.liquids != null && t.build.liquids.get(Packages.mindustry.content.Liquids.water) > 0.01; }},

    // an Elude hovers over deep water; cross the river to the marked square. hard: a wider river with posts in it
    {id: "elude", title: "용암을 건너세요!", sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"],
     plan: (c, r) => { c.shape = "rect"; c.rx0 = 14; c.rx1 = c.hard ? 25 : 20; c.tx = W - 4; c.ty = c.hard ? 4 : CY;
        c.keep = [[c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2], [c.rx0, 1, c.rx1, H - 2]];
        if(c.hard) c.title = "용암을 건너세요! (하드)"; },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        for(var rx = c.rx0; rx <= c.rx1; rx++) for(var ry = 1; ry <= H - 2; ry++){ var t = T(rx, ry); if(t.build == null && t.block() != B.air) t.setAir(); t.setFloor(B.slag); }   // molten slag (user 2026-11-04: lava, not a river); the Elude hovers over it
        if(c.hard) [16, 19, 22].forEach((px, k) => { for(var y = (k % 2 == 0 ? 1 : 7); y <= (k % 2 == 0 ? H - 8 : H - 2); y++) T(px, y).setBlock(wallFor(c)); });
     },
     start: c => mountPlayer(c, U.elude, FAST3 != null ? FAST3 : true),   // faster (user 2026-11-04)
     tick: c => { keepMount(c); noBuild(); },
     leave: c => unmount(c),
     check: c => { var u = Vars.player.unit(); return u != null && u.type != U.block && u.within(c.tx*8, c.ty*8, 12); }},

    // write the same text as the message block beside it (user 2026-11-04)
    {id: "memo", title: "메모를 똑같이 쓰세요!", sandbox: true, themes: ["factory"],
     plan: (c, r) => { // short lowercase words, a new one each time (user 2026-11-04)
        c.text = c.hard ? memoWord() + " " + memoWord() : memoWord(); c.a = [16, CY + 3]; c.b = [18, CY + 3]; c.keep = [[c.a[0] - 1, c.a[1] - 1, c.b[0] + 1, c.b[1] + 1]];
        if(c.hard) c.title = "메모를 똑같이 쓰세요! (하드)"; },
     place: (c, r) => {
        T(c.a[0], c.a[1]).setBlock(B.message, Team.sharded); var a = T(c.a[0], c.a[1]).build; if(a != null){ a.message.setLength(0); a.message.append(c.text); }
        T(c.b[0], c.b[1]).setBlock(B.message, Team.sharded);
        protect(c, c.a[0], c.a[1]); protect(c, c.b[0], c.b[1]);
     },
     start: c => { var a = T(c.a[0], c.a[1]).build; if(a != null && String(a.message.toString()) != c.text){ a.message.setLength(0); a.message.append(c.text); } },
     tick: c => { var a = T(c.a[0], c.a[1]).build; if(a != null && String(a.message.toString()) != c.text){ a.message.setLength(0); a.message.append(c.text); } },   // the sample stays as it was
     check: c => { var b = T(c.b[0], c.b[1]).build; if(b == null || b.message == null) return false; var s = String(b.message.toString()).trim();
        return c.hard ? s == c.text : s.toLowerCase() == c.text; }},

    // draw the same picture on the empty canvas (user 2026-11-04)
    {id: "canvas", title: "똑같이 그리세요!", sandbox: true, themes: ["erekir-yellow", "erekir-arkyic"],
     plan: (c, r) => { c.a = [14, CY + 2]; c.b = [18, CY + 2]; c.keep = [[c.a[0] - 1, c.a[1] - 1, c.b[0] + 2, c.b[1] + 2]];
        // [x, y, colour index]; 0 is the blank colour
        c.pic = canvasPick(c.hard);   // a shape, colour and place picked at random each time (user 2026-11-04)
        if(c.hard) c.title = "똑같이 그리세요! (하드)"; },
     place: (c, r) => {
        T(c.a[0], c.a[1]).setBlock(B.canvas, Team.sharded); T(c.b[0], c.b[1]).setBlock(B.canvas, Team.sharded);
        protect(c, c.a[0], c.a[1]); protect(c, c.b[0], c.b[1]);
        canvasPaint(c);
     },
     start: c => canvasPaint(c),
     tick: c => canvasPaint(c),   // the sample stays as it was
     // the same shape and colours anywhere on the canvas counts (user 2026-11-04)
     check: c => { var b = T(c.b[0], c.b[1]).build; if(b == null || b.data == null) return false; return shapeKey(canvasCells(b)) == shapeKey(c.pic); }},

    // fog of war on: build a radar by the power, then (chained) find the hidden box(es) it shows (user 2026-11-04)
    {id: "radar", title: "레이더를 세우세요!", sandbox: true, themes: ["erekir-carbon", "erekir-arkyic"], allow: ["radar"],
     plan: (c, r) => radarPlan(c, "레이더를 세우세요! (하드)"),
     place: (c, r) => radarPlace(c, false),
     start: c => fogOn(),
     leave: c => { var nm = runList != null && idx >= 0 && idx < runList.length ? MISSIONS[runList[idx]] : null; if(mode == "practice" || nm == null || nm.id != "radar-find") fogOff(); },
     check: c => teamBuilds(b => b.block == B.radar && b.efficiency > 0).length > 0},

    {id: "radar-find", title: "숨은 상자를 찾으세요!", chain: true, sandbox: true, themes: ["erekir-carbon", "erekir-arkyic"],
     plan: (c, r) => radarPlan(c, "숨은 상자를 찾으세요! (하드)"),   // practice only: the radar is given
     place: (c, r) => radarPlace(c, true),
     start: c => { if(c.hard) c.title = "숨은 상자를 찾으세요! (하드)"; fogOn(); c.found = c.hidden.map(p => false);
        c.hidden.forEach(p => { var t = T(p[0], p[1]); if(t.build != null || t.block() != B.air) t.setAir(); t.setBlock(B.container, Team.crux); }); },
     tick: c => {
        teamBuilds(b => b.block == B.radar).forEach(b => { try{ if(b.progress < 1) b.progress = 1; }catch(e){} });   // the radar sees its full reach at once
        var u = Vars.player.unit(); if(u == null) return;
        c.hidden.forEach((p, i) => { if(u.within(p[0]*8, p[1]*8, 16)) c.found[i] = true; });
     },
     leave: c => fogOff(),
     check: c => c.found.every(x => x)},

    // ---- 0.10 Erekir stages (user 2026-11-04): ride an Evoke (Erekir core unit: repair beam, carries a 2x2 block) ----
    // 1) repair a broken beryllium wall (beam boosted to clear fast), 2) chained: carry that wall into the gap of a fake defence line.
    // normal: the large wall in both, hard: the small one. Large: within 1 tile of the gap is fine; small: exactly the gap.
    {id: "repair", title: "블럭을 수리하세요!", sandbox: true, armed: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"],
     plan: (c, r) => erekirPlan(c, r, "블럭을 수리하세요! (하드)"),
     place: (c, r) => erekirPlace(c, r, 0.12),
     start: c => mountPlayer(c, U.evoke, false),
     tick: c => {
        keepMount(c); noBuild();
        var u = Vars.player.unit(), t = T(c.wp[0], c.wp[1]), b = t == null ? null : t.build;
        // 0.13.22: picking the wall up here slowed the Evoke and lost the wall (user 2026-11-05): it goes straight back, as damaged as it was
        try{ if(u != null && u.payloads != null && u.payloads.size > 0){
            var hp = 0.12; try{ var pb = u.payloads.first().build; if(pb != null) hp = Math.max(0.05, pb.health/pb.maxHealth); }catch(e){}
            u.payloads.clear();
            if(b == null){ T(c.wp[0], c.wp[1]).setBlock(c.wallBlock, Team.sharded); b = T(c.wp[0], c.wp[1]).build; if(b != null) b.health = b.maxHealth*hp; }
        } }catch(e){ logErr("repair payload " + e); }
        if(u == null || b == null || b.block != c.wallBlock || !b.damaged()) return;
        // the repair beam at full tilt (user 2026-11-04): about half a second of beam on it
        var m = null; try{ m = u.mounts[0]; }catch(e){}
        var shooting = (m != null && m.shoot) || Vars.player.shooting, onIt = (m != null && m.target == b) || (Math.hypot(Vars.player.mouseX - b.x, Vars.player.mouseY - b.y) < b.block.size*6 + 6 && u.within(b, 80));
        if(shooting && onIt) b.heal(b.maxHealth/30);
     },
     // stays in the Evoke for the next (chained) stage; anything else puts the player back
     leave: c => { var nm = runList != null && idx >= 0 && idx < runList.length ? MISSIONS[runList[idx]] : null; if(mode == "practice" || nm == null || nm.id != "wall-place") unmount(c); },
     check: c => { var t = T(c.wp[0], c.wp[1]), b = t == null ? null : t.build; return b != null && b.block == c.wallBlock && b.health >= b.maxHealth - 0.5; }},

    {id: "wall-place", title: "방어선을 채우세요!", chain: true, sandbox: true, themes: ["erekir-carbon", "erekir-yellow", "erekir-arkyic"],
     plan: (c, r) => erekirPlan(c, r, "방어선을 채우세요! (하드)"),   // practice only: a room of its own with the wall already mended
     place: (c, r) => erekirPlace(c, r, 1),
     start: c => { if(c.hard) c.title = "방어선을 채우세요! (하드)"; if(c.mount == null || !c.mount.isAdded() || Vars.player.unit() != c.mount) mountPlayer(c, U.evoke, false); },
     tick: c => { keepMount(c); noBuild(); },
     leave: c => unmount(c),
     check: c => {
        var tol = c.hard ? 0 : 1;
        for(var x = c.lx - tol; x <= c.lx + tol; x++) for(var y = c.gy - tol; y <= c.gy + tol; y++){
            var t = T(x, y); if(t == null || t.build == null) continue;
            var b = t.build; if(b.block == c.wallBlock && b.team == Team.sharded && b.tile.x == x && b.tile.y == y) return true;
        }
        return false;
     }},

    // just before the crawlers (user 2026-11-04): send a broken Flare to a working repair point by command, without riding it
    {id: "flare", title: "플레어를 수리받게 하세요!", sandbox: true, themes: ["grass", "spore", "snow"],
     plan: (c, r) => {
        c.rp = [ri(r, W - 9, W - 6), ri(r, 4, H - 6)];
        c.spawns = c.hard ? [[10, 3], [12, CY], [10, H - 4]] : [[ri(r, 10, 13), ri(r, 3, H - 4)]];
        c.keep = [[c.rp[0] - 2, c.rp[1] - 2, c.rp[0] + 2, c.rp[1] + 2]].concat(c.spawns.map(p => [p[0] - 1, p[1] - 1, p[0] + 1, p[1] + 1]));
        if(c.hard) c.title = "플레어를 수리받게 하세요! (하드)";
     },
     place: (c, r) => {
        T(c.rp[0], c.rp[1]).setBlock(B.repairPoint, Team.sharded); T(c.rp[0] + 1, c.rp[1]).setBlock(B.powerSource, Team.sharded);   // powered and working
        protect(c, c.rp[0], c.rp[1]); protect(c, c.rp[0] + 1, c.rp[1]);
     },
     start: c => { c.flares = []; c.lastOwn = null;
        c.spawns.forEach(p => { var f = U.flare.spawn(Team.sharded, p[0]*8, p[1]*8); f.health = f.maxHealth*0.2; f.apply(SE.disarmed, 1e7); c.flares.push(f); }); },
     tick: c => {
        var u = Vars.player.unit(), rb = T(c.rp[0], c.rp[1]).build;
        // the repair point mends a Flare in its reach quickly, so the run keeps its pace
        if(rb != null) c.flares.forEach(f => { if(f.isAdded() && f.damaged() && f.within(rb, 60 + f.hitSize/2)) f.heal(f.maxHealth/40); });
        if(u == null) return;
        if(c.flares.indexOf(u) < 0){ if(!Vars.player.dead()) c.lastOwn = u; return; }
        // no riding the Flare: taking control of one puts the player back (as with the far crawler)
        var f0 = u, back = c.lastOwn;
        if(back != null && back.isAdded() && back.team == Team.sharded && c.flares.indexOf(back) < 0) Vars.player.unit(back); else Vars.player.clearUnit();
        try{ f0.resetController(); }catch(e){}
        Vars.ui.showInfoToast("플레어는 직접 탈 수 없어요. 명령으로 보내세요!", 1.5);
     },
     check: c => c.flares.every(f => f.isAdded() && f.health >= f.maxHealth - 0.5)},

    // ride a Mega (no building or breaking) and carry a Dagger (hard: a battery) over the wall to the marked square (user 2026-11-03)
    {id: "transport", title: "대거를 수송하세요!", sandbox: true, themes: ["grass", "spore"],
     plan: (c, r) => {
        c.shape = "rect"; c.cx = 9; c.cy = ri(r, 4, H - 5); c.wx = ri(r, 16, 20);
        c.tx = W - 5; c.ty = ri(r, 4, H - 5);
        c.keep = [[c.cx - 1, c.cy - 1, c.cx + 1, c.cy + 1], [c.tx - 2, c.ty - 2, c.tx + 2, c.ty + 2]];
        if(c.hard) c.title = "배터리를 수송하세요! (하드)";
     },
     place: (c, r) => {
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++) T(x, y).setFloor(markFloor());
        var wall = wallFor(c); for(var y2 = 1; y2 < H - 1; y2++){ var t = T(c.wx, y2); if(t.build == null) t.setBlock(wall); }
        if(c.hard) T(c.cx, c.cy).setBlock(B.battery, Team.sharded);
     },
     start: c => {
        if(!c.hard){ c.cargo = U.dagger.spawn(Team.sharded, c.cx*8, c.cy*8); c.cargo.apply(SE.disarmed, 1e7); }
        mountPlayer(c, U.mega, false);
     },
     tick: c => {
        keepMount(c);
        var u = Vars.player.unit(); if(u != null){ try{ u.plans.clear(); u.updateBuilding = false; }catch(e){} }   // no building or breaking
     },
     leave: c => { unmount(c); if(c.cargo != null){ try{ c.cargo.remove(); }catch(e){} c.cargo = null; } },
     check: c => {
        if(!c.hard) return c.cargo != null && c.cargo.isAdded() && c.cargo.within(c.tx*8, c.ty*8, 14);
        for(var x = c.tx - 1; x <= c.tx + 1; x++) for(var y = c.ty - 1; y <= c.ty + 1; y++){ var t = T(x, y); if(t.build != null && t.build.block == B.battery) return true; }
        return false;
     }}

];

// 0.8 (user 2026-11-03): 19 stages in a fixed order; the mine -> Duo -> daggers chain stays together at the end
var ORDER = ["move", "switch", "drill", "plasma-bore", "door", "rebuild", "conveyor", "copy", "bridge", "rotate", "core-take", "unloader", "power", "beam", "silicon", "light", "filter", "junction", "memo", "canvas", "processor", "wall", "water", "tsunami", "turbine", "turbine-water", "router", "poly", "transport", "repair", "wall-place", "regen", "beryllium", "elude", "nova", "radar", "radar-find", "flare", "force", "crawler", "mine", "build-duo", "daggers", "ping", "reactor"];   // 0.13: 45 stages + the reactor ending (user 2026-11-04)
MISSIONS = ORDER.map(id => MISSIONS.filter(m => m.id == id)[0]).filter(m => m != null);

// belts connected: from the last given belt, follow each belt's front until the first belt of the other line
function connected(from, to){
    var t = T(from[0], from[1]); if(t == null || t.build == null) return false;
    var b = t.build, seen = {};
    for(var i = 0; i < 300; i++){
        var f = b.front(); if(f == null) return false;
        if(f.tile.x == to[0] && f.tile.y == to[1]) return true;
        var name = String(f.block.name); if(name.indexOf("conveyor") < 0) return false;
        var key = f.tile.x + "," + f.tile.y; if(seen[key]) return false; seen[key] = 1;
        b = f;
    }
    return false;
}

// an open floor tile 6-10 tiles from the Duo, right side first, never on the core
function daggerSpot(duo, i){
    if(duo == null) return [W - 3, CY - 2 + i];
    var bx = duo.tile.x, by = duo.tile.y, dirs = [[1, 0], [1, 1], [1, -1], [0, 1], [0, -1], [-1, 0]];
    for(var dist = 10; dist >= 6; dist--) for(var k = 0; k < dirs.length; k++){
        var x = bx + dirs[k][0]*dist, y = by + dirs[k][1]*Math.round(dist*0.7) + (i % 3) - 1, t = T(x, y);
        if(t != null && x > 0 && y > 0 && x < W - 1 && y < H - 1 && !t.solid() && !isCoreTile(x, y) && Math.abs(x - CORE_X) > 3) return [x, y];
    }
    return [W - 3, CY - 2 + i];
}
function isCoreTile(x, y){ return x >= CORE_X - 1 && x <= CORE_X + 1 && y >= CY - 1 && y <= CY + 1; }

// repaint the room in place for a non-chained stage: clear, paint floor and walls by theme and shape, decorate, then the stage's blocks
function buildRoom(m, c){
    var r = rng(c.seed);
    c.theme = m.themes[Math.floor(r()*m.themes.length)]; c.shape = SHAPES[Math.floor(r()*SHAPES.length)];
    m.plan(c, r);
    var th = THEMES[c.theme], s = Math.floor(r()*100000);
    var open = [], keep = [];
    for(var x = 0; x < W; x++){ open.push([]); keep.push([]); for(var y = 0; y < H; y++){ open[x].push(inShape(c.shape, x, y, W, H)); keep[x].push(false); } }
    function mark(x0, y0, x1, y1, k){ for(var x = Math.max(1, x0); x <= Math.min(W - 2, x1); x++) for(var y = Math.max(1, y0); y <= Math.min(H - 2, y1); y++){ open[x][y] = true; if(k) keep[x][y] = true; } }
    mark(1, CY - 2, W - 2, CY + 2, false);
    mark(1, CY - 3, 7, CY + 3, true);   // around the core
    c.keep.forEach(b => { mark(b[0], b[1], b[2], b[3], true); var mx = Math.floor((b[0] + b[2])/2); mark(mx - 1, Math.min(b[1], CY), mx + 1, Math.max(b[3], CY), false); });

    // clear: every unit but the player's, every building but the core; the player back beside the core
    var G = Packages.mindustry.gen.Groups, units = new Seq(); G.unit.copy(units); units.each(u => { if(u != Vars.player.unit()) u.remove(); });
    G.bullet.clear();
    // the core unit stays where it is between stages (user 2026-11-04); it floats, so no wall can trap it. Ridden units start beside the core anyway.
    var pu = Vars.player.unit(); if(pu != null && pu.type != U.alpha && pu.type != U.block){ pu.set((CORE_X + 3)*8, CY*8); pu.vel.setZero(); }
    for(var x = 0; x < WW; x++) for(var y = 0; y < H; y++){   // the stretch past the room (x >= W) is wall
        if(isCoreTile(x, y)) continue;
        var t = T(x, y), n = Packages.arc.util.noise.Simplex.noise2d(s, 2, 0.5, 1/7, x, y);
        var edge = x < 1 || y < 1 || x >= W - 1 || y >= H - 1, wall = edge || !open[x][y] ? wallFor(c) : B.air;
        if(t.block() != B.air || t.build != null) t.setAir();
        t.setFloor(th.floor[n > 0.62 && th.floor.length > 1 ? 1 : n < 0.3 && th.floor.length > 2 ? 2 : 0]);
        if(t.overlay() != B.air) t.setOverlay(B.air);   // newer builds' setFloor keeps the ore (v146's cleared it): the leftover ore (user 2026-11-03)
        if(wall != B.air) t.setBlock(wall);
    }
    for(var d = 0; d < Math.floor(W*H/45); d++){   // small clumps, never in a keep box or the core band
        var dx = ri(r, 2, W - 3), dy = ri(r, 2, H - 3), dec = th.decor[Math.floor(r()*th.decor.length)], size = ri(r, 1, 3);
        for(var j = 0; j < size; j++){
            var tx = dx + (j == 1 ? 1 : 0), ty = dy + (j == 2 ? 1 : 0);
            if(tx >= W - 1 || ty >= H - 1 || !open[tx][ty] || keep[tx][ty] || Math.abs(ty - CY) <= 2) continue;
            T(tx, ty).setBlock(dec);
        }
    }
    var core = Vars.player.team().core(); if(core != null) core.items.clear();
    m.place(c, r);
    redrawFloor();
}

// ---- run flow ----
function bestData(){
    var b = rd(DIR + "/mindrun-best.json") || {};
    if(b.total != null && b.normal == null) b = {normal: {total: b.total, splits: b.splits, at: b.at}};   // 0.1/0.2 kept one best
    if(b.version != 4 && b.version != 5 && b.version != 6 && b.version != 7 && b.version != 8) b = {version: 4, old: b};   // 0.4 is a different run (10 stages in a fixed order): old bests kept aside, hard locked again
    if(b.version == 4) b = {version: 5, old4: {normal: b.normal, hard: b.hard}, hard_unlocked: b.hard_unlocked, practice: b.practice};
    if(b.version == 5) b = {version: 6, old5: {normal: b.normal, hard: b.hard}, old4: b.old4, hard_unlocked: b.hard_unlocked, practice: b.practice};   // 0.10: 22 stages, run bests start over   // 0.8: 19 stages, run bests start over; hard stays open, practice bests stay
    if(b.version == 6) b = {version: 7, old6: {normal: b.normal, hard: b.hard}, old5: b.old5, old4: b.old4, hard_unlocked: b.hard_unlocked, practice: {}};   // 0.11: 30 stages, fixed layouts: all bests start over
    if(b.version == 7) b = {version: 8, old7: {normal: b.normal, hard: b.hard}, hard_unlocked: b.hard_unlocked, practice: b.practice};   // 0.13: 45 stages: run bests start over, practice bests stay
    return b;
}
function startRun(m, stage, hard){
    try{ if(runMusic != null && runMusic.isPlaying()) runMusic.stop(); }catch(e){}   // a new run starts the song from the top (user 2026-11-03)
    musicHold = false;
    mode = m || "normal";
    if(mode == "practice"){ practiceIdx = stage || 0; practiceHard = !!hard; attempt = 0; }
    runSeed = Number(java.lang.System.currentTimeMillis() % 1000000007);
    runList = MISSIONS.map((x, k) => k);   // fixed order (user 2026-11-03)
    splits = []; idx = -1; active = true; runStamp = stamp(); ctx = null; mission = null;
    pending = true; worldLoaded = false; done = false;
    Vars.ui.loadAnd(run(() => {
        try{
            if(Vars.net.client() || Vars.net.active()) Vars.net.disconnect();
            Vars.logic.reset();
            var rules = new Rules();
            rules.waves = false; rules.waveTimer = false; rules.sector = null; rules.editor = false;
            rules.loadout = new Seq();
            // sandbox builds for free, but nothing may make items, liquids or power out of nothing
            rules.blockWhitelist = true;   // nothing buildable until a stage allows it
            try{ rules.planet = Packages.mindustry.content.Planets.sun; }catch(e){ logErr("planet " + e); }   // Serpulo and Erekir blocks both buildable (0.11)
            fogOff();
            Vars.state.rules = rules;
            Vars.world.loadGenerator(WW, H, cons(tiles => {   // the bare room; the first stage paints it (open past the room, so no baked darkness there)
                for(var x = 0; x < WW; x++) for(var y = 0; y < H; y++){
                    var edge = x < 1 || y < 1 || x >= WW - 1 || y >= H - 1 || x == W - 1;
                    tiles.set(x, y, new Tile(x, y, B.stone, B.air, edge ? B.stoneWall : B.air));
                }
                tiles.getn(CORE_X, CY).setBlock(B.coreShard, Team.sharded);
            }));
            // StringMap.of resolves to ObjectMap.of on Android, so fill the map by hand (0.13.15)
            var mapTags = new StringMap();
            mapTags.put("name", "MINDRUN" + (mode == "hard" ? " 하드" : mode == "practice" ? " 연습" : ""));
            Vars.state.map = new MapC(mapTags);
            Vars.state.rules = rules;
            Vars.logic.play();
        }catch(e){ Vars.ui.showInfo("맵 만들기 실패: " + e); endRun("load_failed"); }
    }));
}

function playerReady(){
    if(Vars.player.dead()) return false;
    var u = Vars.player.unit(); if(u == null || !u.isAdded()) return false;
    return u.type != U.block || (mission != null && mission.chain);   // a chained stage may begin inside a Duo
}
function isHard(){ return mode == "hard" || (mode == "practice" && practiceHard); }
function nextMission(){
    if(mode == "practice"){ idx = practiceIdx; attempt++; }   // the same stage again, a fresh room
    else{ idx++; if(idx >= runList.length){ endRun("finished"); return; } }
    if(mission != null && mission.leave && ctx != null){ try{ mission.leave(ctx); }catch(e){ logErr("leave " + e); } }   // e.g. off the Dagger, back to the core
    try{ var pu = Vars.player.unit(); if(pu != null && pu.stack != null) pu.clearItem(); }catch(e){ logErr("clear item " + e); }   // nothing carried into the next stage (user 2026-11-03)
    var m = MISSIONS[runList[idx]], c, chained = m.chain && ctx != null && mode != "practice";
    if(chained){ c = ctx; c.idx = idx; }   // the same room and what the player made in it
    else c = {seed: stageSeed(m.id), idx: idx, hard: isHard(), practice: mode == "practice"};   // 0.11 (user 2026-11-04): no randomness, every stage is the same each time
    c.title = m.title; mission = m; ctx = c;
    try{
        Vars.state.rules.infiniteResources = m.sandbox; Vars.state.rules.buildCostMultiplier = m.cost || 1;
        setAllowed(m.allow);
        if(!chained) buildRoom(m, c);
        m.start(c);
    }catch(e){ logErr("stage " + e); Vars.ui.showInfo("단계 만들기 실패: " + e); endRun("load_failed"); return; }
    done = false; nextAt = 0; elapsed = 0; started = false; lastNano = Number(java.lang.System.nanoTime());
    Vars.ui.announce(c.title, 1.5);
}

function clear(status){
    if(done) return;
    done = true;
    var t = elapsed + (status == "skipped" ? SKIP_PENALTY : 0);
    splits.push({mission: mission.id, title: ctx.title, theme: ctx.theme, shape: ctx.shape, status: status, s: Math.round(t*1000)/1000});   // to 0.001 s (user 2026-11-03)
    if(mode == "practice"){
        var key = mission.id + (isHard() ? "-hard" : ""), data = bestData(); data.practice = data.practice || {};
        var pb = data.practice[key], nb = status == "done" && (pb == null || t < pb);
        pCache = null;
        if(nb){ data.practice[key] = Math.round(t*1000)/1000; try{ wr(DIR + "/mindrun-best.json", data); }catch(e){} }
        Vars.ui.showInfoToast("성공! " + sec(t) + (nb ? "  최고 기록!" : pb != null ? "  (최고 " + sec(pb) + ")" : ""), 1.0);
    }else Vars.ui.showInfoToast((status == "skipped" ? "건너뜀 +" + SKIP_PENALTY + "초 " : "성공! ") + sec(t), 1.0);
    nextAt = Date.now() + NEXT_DELAY_MS;
}

function total(){ var s = 0; splits.forEach(x => s += x.s); return s; }

function resultsH(){ try{ return Math.max(200, Packages.arc.Core.graphics.getHeight()/Packages.arc.scene.ui.layout.Scl.scl(1) - 230); }catch(e){ return 500; } }
function endRun(status){
    if(!active) return;
    active = false; pending = false; musicHold = true;
    fogOff();
    if(mode == "practice") return;   // practice keeps no run record
    var tot = Math.round(total()*1000)/1000, clean = status == "finished" && splits.length == runList.length && splits.every(x => x.status == "done");
    var data = bestData(), best = data[mode], newBest = clean && (best == null || tot < best.total);
    var unlock = mode == "normal" && clean && tot < UNLOCK_S && !data.hard_unlocked;
    if(newBest) data[mode] = {total: tot, splits: splits, at: runStamp};
    if(unlock) data.hard_unlocked = true;
    var res = {status: status, mode: mode, total: tot, splits: splits, run_seed: runSeed, missions: runList.map(k => MISSIONS[k].id), new_best: newBest, unlocked_hard: unlock, version: VERSION};
    try{ wr(LOGS + "/" + runStamp + "/result.json", res); if(newBest || unlock) wr(DIR + "/mindrun-best.json", data); }catch(e){ print("mindrun save " + e); }
    if(clean) sheetSubmit(tot);   // the online ranking (user 2026-11-04)
    if(status == "timeout"){ timeoutDialog(); return; }
    if(status != "finished") return;
    // 45 lines ran off the screen (user 2026-11-05): the splits go in two columns, the total below them
    var lines = splits.map((x, i) => (i + 1) + ". " + x.title + "  " + (x.status == "skipped" ? "건너뜀 " : "") + sec(x.s)), half = Math.ceil(lines.length/2);
    var colA = lines.slice(0, half).join("\n"), colB = lines.slice(half).join("\n");
    var txt = "총 " + sec(tot) + (newBest ? "  [accent]최고 기록![]" : best != null ? "  (최고 " + sec(best.total) + ")" : "");
    if(unlock) txt += "\n[accent]하드모드가 열렸어요![]";
    else if(mode == "normal" && !data.hard_unlocked) txt += "\n하드모드: 노말을 건너뛰기 없이 깨면 열려요";
    // cancel / again, and a hard button once hard is open after a normal run (user 2026-11-03)
    var again = mode, Icon = Packages.mindustry.gen.Icon, d = new Packages.mindustry.ui.dialogs.BaseDialog("MINDRUN " + (mode == "hard" ? "하드 " : "") + "완료");
    d.cont.pane(cons(p => { p.table(cons(t => { t.top(); t.add(colA).top().left().padRight(30); t.add(colB).top().left(); })); })).maxHeight(resultsH()); d.cont.row();
    d.cont.add(txt).center().padTop(8); d.cont.row();
    d.hidden(run(() => { musicHold = false; }));   // closing the results stops the music (a new run turns it back on)
    d.buttons.defaults().size(200, 56).pad(4);
    d.buttons.button("취소", Icon.cancel, run(() => d.hide()));
    d.buttons.button("한 판 더", Icon.refresh, run(() => { d.hide(); startRun(again); }));
    if(mode == "normal" && data.hard_unlocked) d.buttons.button("하드모드 도전", Icon.warning, run(() => { d.hide(); startRun("hard"); }));
    d.show();
}

function practiceExtra(){
    if(mission.id == "mine" && ctx.mined != null) return "   " + ctx.items.map(it => itemName(it) + " " + Math.min(1, ctx.mined[it] || 0) + "/1").join("  ");
    if(mission.id == "crawler" && ctx.spawns.length > 1) return "   " + ctx.dead + "/" + ctx.spawns.length;
    if(mission.id == "daggers" || mission.id == "breach-defend") return "   " + ctx.daggersDead + "/" + ctx.daggers;
    if(mission.id == "beryllium" && ctx.mined != null) return "   " + ctx.veins.map(v => itemName(v[2]) + " " + Math.min(1, ctx.mined[v[2]] || 0) + "/1").join("  ");
    if(mission.id == "force" && ctx.hits != null) return "   " + Math.min(ctx.need, ctx.hits) + "/" + ctx.need;
    if(mission.id == "tsunami" && ctx.out != null) return "   " + ctx.out + "/" + ctx.fires.length;
    if(mission.id == "flare" && ctx.flares != null && ctx.flares.length > 1) return "   " + ctx.flares.filter(f => f.isAdded() && f.health >= f.maxHealth - 0.5).length + "/" + ctx.flares.length;
    return "";
}
// the clock in the top-left status box (the wave box, empty with waves off) via rules.mission, which overrides its text (user 2026-11-03)
var missionOk = false;
function hudText(){
    if(!active || pending || mission == null) return active ? "MINDRUN 준비 중..." : "";
    var t = done ? splits[splits.length - 1].s : elapsed, hard = isHard();
    var head = "[accent]" + (mode == "practice" ? "연습 " : hard ? "하드 " : "") + (idx + 1) + "/" + runList.length + "[] " + ctx.title.replace(" (하드)", "");
    // "현재: x" and "최고기록: y" on lines of their own, no 초 (user 2026-11-03)
    var tail = mode == "practice" ? (function(){ var pk = pbest()[mission.id + (hard ? "-hard" : "")]; return "[lightgray]최고기록: " + (pk != null ? fixed(pk, 3) : "-") + "[]"; })()
        : "[lightgray]총: " + fixed(total() + (done ? 0 : t), 3) + "[]" + (LIMIT[mode] != null ? "\n" + (LIMIT[mode] - total() - (done ? 0 : t) < 10 ? "[scarlet]" : "[lightgray]") + "남은 시간: " + fixed(Math.max(0, LIMIT[mode] - total() - (done ? 0 : t)), 3) + "[]" : "");
    var ex = practiceExtra().trim(); return head + "\n[white]현재: " + fixed(t, 3) + "[]\n" + tail + (ex ? "\n" + ex : "");
}
var pCache = null;
function pbest(){ if(pCache == null) pCache = bestData().practice || {}; return pCache; }
function hudMission(){
    try{
        if(Vars.state.isMenu()) return;
        Vars.state.rules.mission = active ? hudText() : "";
        missionOk = true;
    }catch(e){ missionOk = false; logErr("hud mission " + e); }
}
function timeoutDialog(){
    var again = mode, Icon = Packages.mindustry.gen.Icon, d = new Packages.mindustry.ui.dialogs.BaseDialog("MINDRUN " + (mode == "hard" ? "하드 " : "") + "시간 초과");
    d.cont.add("[scarlet]시간 초과![]\n\n" + splits.length + "/" + runList.length + "단계까지 깼어요\n제한 " + LIMIT[mode] + "초").center(); d.cont.row();
    d.hidden(run(() => { musicHold = false; }));
    d.buttons.defaults().size(200, 56).pad(4);
    d.buttons.button("취소", Icon.cancel, run(() => d.hide()));
    d.buttons.button("한 판 더", Icon.refresh, run(() => { d.hide(); startRun(again); }));
    d.show();
}
function lineText(){
    if(!active) return "";
    if(pending || mission == null) return "[MINDRUN" + (mode == "hard" ? " 하드" : mode == "practice" ? " 연습" : "") + "] 준비 중...";
    if(mode == "practice"){
        var pt = done ? splits[splits.length - 1].s : elapsed, pk = pbest()[mission.id + (isHard() ? "-hard" : "")];
        return "[MINDRUN 연습 " + (idx + 1) + "/" + runList.length + "] " + ctx.title + "   " + sec(pt) + (pk != null ? "   (최고 " + sec(pk) + ")" : "") + practiceExtra();
    }
    var head = "[MINDRUN " + (mode == "hard" ? "하드 " : "") + (idx + 1) + "/" + runList.length + "] " + ctx.title;
    var t = done ? splits[splits.length - 1].s : elapsed, extra = "";
    if(mission.id == "mine" && ctx.mined != null) extra = "   " + ctx.items.map(it => itemName(it) + " " + Math.min(1, ctx.mined[it] || 0) + "/1").join("  ");
    if(mission.id == "crawler" && ctx.spawns.length > 1) extra = "   " + ctx.dead + "/" + ctx.spawns.length;
    if(mission.id == "daggers") extra = "   " + ctx.daggersDead + "/" + ctx.daggers;
    return head + "   " + sec(t) + "   (총 " + sec(total() + (done ? 0 : t)) + ")" + extra;
}

// ---- online ranking (user 2026-11-04): a Google Sheet behind an Apps Script web app (WORDLE/mindrun-ranking/Code.gs) ----
// clean runs (finished, no skips) are sent there with the player's name; the top list is read back. Practice is never sent.
var SHEET_URL = "https://script.google.com/macros/s/AKfycby-OmTIZr4hQ4RXHlEZQ-x4f837sx2EhTIxCiTjlm4kF_-35hybgwrUDlWx6Gxdn7M/exec";   // the web app URL ending in /exec; empty = ranking off
var SHEET_SALT = "mindrun-sheet-2026";   // the same as in Code.gs
function courseId(){ return String(stageSeed(ORDER.join(","))); }   // runs over a different stage list are ranked apart
function playerName(){
    var n = "player"; try{ n = String(Vars.player.name); }catch(e){}
    try{ n = String(Packages.arc.util.Strings.stripColors(n)); }catch(e){}
    n = n.trim(); return n.length > 0 ? n.substring(0, 24) : "player";
}
function sheetSign(d){ var s = d.name + "|" + d.mode + "|" + fixed(d.total, 3) + "|" + d.course + "|" + SHEET_SALT, h = 5381;
    for(var i = 0; i < s.length; i++) h = ((h*33) ^ s.charCodeAt(i)) >>> 0; return h.toString(16); }
function sheetGet(params, done){
    // every callback is guarded: an exception on the main thread here crashed the whole game when loading failed (user 2026-11-05)
    var safe = (o, err) => { try{ done(o, err); }catch(x){ logErr("ranking callback " + x); } };
    if(SHEET_URL == ""){ safe(null, "랭킹 주소가 아직 설정되지 않았어요"); return; }
    var post = f => { try{ Packages.arc.Core.app.post(run(() => { try{ f(); }catch(x){ logErr("ranking post " + x); } })); }catch(x){ logErr("ranking post " + x); } };
    var req = null;
    try{
        var q = Object.keys(params).map(k => k + "=" + java.net.URLEncoder.encode(String(params[k]), "UTF-8")).join("&");
        req = Packages.arc.util.Http.get(SHEET_URL + "?" + q);
    }catch(e){ logErr("ranking request " + e); safe(null, "요청을 만들지 못했어요"); return; }
    try{ req.timeout(15000); }catch(e){ logErr("ranking timeout " + e); }   // a missing method on some builds must not stop the request
    try{
        req.error(cons(e => { var m = "error"; try{ m = String(e); }catch(x){} post(() => safe(null, m)); }));
        req.submit(res => { var txt = null; try{ txt = String(res.getResultAsString()); }catch(x){} post(() => {
            var o = null; try{ o = JSON.parse(txt); }catch(x){}
            if(o == null || typeof o != "object") safe(null, "응답을 읽지 못했어요"); else safe(o, null); }); });
    }catch(e){ logErr("ranking send " + e); safe(null, "요청을 보내지 못했어요"); }
}
// a short reason instead of the whole exception and URL (it ran off the screen, user 2026-11-04)
// no regex here: Rhino's regex engine crashed the game on some exception texts (user 2026-11-05 crash report)
function shortErr(e){
    var t = ""; try{ t = String(e); }catch(x){ return "오류"; }
    var code = null, i = t.indexOf("HTTP");
    if(i >= 0){ var j = i + 4; while(j < t.length && (t.charAt(j) == " " || t.charAt(j) == ":")) j++; var c = t.substring(j, j + 3); if(c.length == 3 && !isNaN(Number(c))) code = c; }
    if(code == "403") return "접근 거부(403): 웹앱 액세스를 '모든 사용자'로";
    if(code != null) return "HTTP " + code;
    if(t.indexOf("Timeout") >= 0 || t.indexOf("timed out") >= 0) return "응답 시간 초과";
    return t.length > 60 ? t.substring(0, 60) + "..." : t;
}
function sheetSubmit(tot){
    if(SHEET_URL == "") return;
    var d = {name: playerName(), mode: mode, total: tot, course: courseId(), version: VERSION, splits: splits.map(x => x.s)};
    d.check = sheetSign(d);
    sheetGet({action: "submit", data: JSON.stringify(d)}, (o, err) => {
        if(err != null || !o.ok) logErr("ranking submit " + (err || o.err)); if(err != null) err = shortErr(err);
        Vars.ui.showInfoToast(err == null && o.ok ? "랭킹에 등록했어요 (" + d.name + ")" : "랭킹 등록 실패: " + (err || o.err), 3);
    });
}
function rankingDialog(){
    var d = new Packages.mindustry.ui.dialogs.BaseDialog("MINDRUN 랭킹"), me = playerName(), cols = {};
    d.cont.table(cons(t => {
        ["normal", "hard"].forEach(md => {
            t.table(cons(col => { col.top(); col.defaults().left().pad(2); col.add(md == "normal" ? "[accent]NORMAL[]" : "[scarlet]HARD[]").padBottom(6); col.row(); cols[md] = col.add("불러오는 중...").wrap().width(320).get(); })).top().width(340).pad(10);
        });
    }));
    d.cont.row(); d.cont.add("[lightgray]이름: " + me + "  (설정의 플레이어 이름)[]").padTop(8);
    d.addCloseButton(); d.show();
    ["normal", "hard"].forEach(md => sheetGet({action: "top", mode: md, course: courseId(), n: 10}, (o, err) => {
        var lbl = cols[md]; if(lbl == null) return;
        if(err != null || !o.ok || o.top == null){ if(err != null) logErr("ranking top " + err); lbl.setText("불러오지 못했어요\n" + (err != null ? shortErr(err) : String(o.err || "빈 응답"))); return; }
        if(o.top.length == 0){ lbl.setText("아직 기록이 없어요"); return; }
        lbl.setText(o.top.map((r, i) => (r.name == me ? "[accent]" : "") + (i + 1) + ". " + r.name + "  " + fixed(Number(r.total), 3) + (r.name == me ? "[]" : "")).join("\n"));
    }));
}

// NORMAL / HARD / PRACTICE before a run (user 2026-11-03)
function modeDialog(){
    var Icon = Packages.mindustry.gen.Icon, d = new Packages.mindustry.ui.dialogs.BaseDialog("MINDRUN"), data = bestData();
    d.cont.defaults().size(320, 64).pad(6);
    d.cont.button("NORMAL" + (data.normal ? "   (최고 " + sec(data.normal.total) + ")" : ""), Icon.play, run(() => { d.hide(); startRun("normal"); })); d.cont.row();
    d.cont.button("HARD" + (data.hard_unlocked ? (data.hard ? "   (최고 " + sec(data.hard.total) + ")" : "") : "   [잠김]"), Icon.warning, run(() => {
        if(!data.hard_unlocked){ Vars.ui.showInfo("하드모드는 노말을 건너뛰기 없이 깨면 열려요 (제한 " + LIMIT.normal + "초).\n노말 최고: " + (data.normal ? sec(data.normal.total) : "없음")); return; }
        d.hide(); startRun("hard");
    })); d.cont.row();
    d.cont.button("PRACTICE", Icon.book, run(() => { d.hide(); practiceDialog(); })); d.cont.row();
    d.cont.button("랭킹", Icon.list, run(() => rankingDialog()));
    d.addCloseButton();
    d.show();
}
function practiceDialog(){
    var Icon = Packages.mindustry.gen.Icon, d = new Packages.mindustry.ui.dialogs.BaseDialog("MINDRUN PRACTICE"), pd = bestData().practice || {};
    d.cont.pane(cons(t => {
        t.defaults().pad(3);
        MISSIONS.forEach((m, i) => {
            t.add((i + 1) + ". " + m.title).left().width(300);
            var bn = pd[m.id], bh = pd[m.id + "-hard"];
            t.button("노말" + (bn != null ? " " + fixed(bn, 3) : ""), run(() => { d.hide(); startRun("practice", i, false); })).size(150, 48);
            t.button("하드" + (bh != null ? " " + fixed(bh, 3) : ""), run(() => { d.hide(); startRun("practice", i, true); })).size(150, 48);
            t.row();
        });
    })).grow();
    d.addCloseButton();
    d.show();
}
function practiceGo(step){
    if(!active || mode != "practice" || pending) return;
    practiceIdx = (practiceIdx + step + MISSIONS.length) % MISSIONS.length;
    done = false; nextMission();
}

// ---- UI: [MINDRUN] in the Join Game window, one line on the HUD, skip / quit in the ESC menu ----
function buildUi(){
    var Styles = Packages.mindustry.ui.Styles, Icon = Packages.mindustry.gen.Icon;
    // [MINDRUN] under Play in the main menu, beside Load Game (user 2026-11-03); the Join Game window only if that fails
    var inMenu = false;
    try{
        var MB = Packages.mindustry.ui.fragments.MenuFragment.MenuButton, btns = Vars.ui.menufrag.desktopButtons;
        if(btns != null && btns.size > 0 && btns.first().submenu != null){
            btns.first().submenu.add(new MB("MINDRUN", Icon.play, run(() => modeDialog())));
            inMenu = true;
        }
    }catch(x){ logErr("ui menu " + x); }
    if(!inMenu){
        try{ Vars.ui.join.buttons.button("MINDRUN", Icon.play, run(() => { Vars.ui.join.hide(); modeDialog(); })); }catch(x){ print("mindrun ui join " + x); }
    }
    try{
        Vars.ui.hudGroup.fill(cons(t => {
            t.name = "mindrun"; t.top(); t.marginTop(64);   // below MINDLE's line, in case both show
            t.visibility = boolp(() => active && !Vars.state.isMenu() && !missionOk);   // the field: Rhino reads t.visible as the boolean field (MINDLE 0.1.1)
            t.table(Styles.black6, cons(p => { p.margin(4); line = p.add("").get(); }));
        }));
    }catch(x){ print("mindrun ui hud " + x); }
    try{
        Vars.ui.paused.shown(run(() => {   // after the dialog's own rebuild
            try{
                if(!active || Vars.state.isMenu()) return;
                var c = Vars.ui.paused.cont;
                c.row();
                c.table(cons(t => {
                    if(mode == "practice"){   // previous / next stage (user 2026-11-03)
                        t.add(lineText()).colspan(3).padBottom(4); t.row();
                        t.button("이전 단계", Icon.left, run(() => { Vars.ui.paused.hide(); practiceGo(-1); })).size(200, 55).pad(4);
                        t.button("다시", Icon.refresh, run(() => { Vars.ui.paused.hide(); practiceGo(0); })).size(200, 55).pad(4);
                        t.button("다음 단계", Icon.right, run(() => { Vars.ui.paused.hide(); practiceGo(1); })).size(200, 55).pad(4); t.row();
                        t.button("하드 " + (practiceHard ? "끄기" : "켜기"), Icon.warning, run(() => { Vars.ui.paused.hide(); practiceHard = !practiceHard; practiceGo(0); })).size(200, 55).pad(4);
                        t.button("그만하기", Icon.cancel, run(() => { Vars.ui.paused.hide(); endRun("quit"); })).size(200, 55).pad(4);
                        return;
                    }
                    t.add(lineText()).colspan(3).padBottom(4); t.row();
                    // restart the whole run from stage 1 (user 2026-11-05)
                    t.button("처음부터 다시", Icon.refresh, run(() => { Vars.ui.paused.hide(); var m = mode; endRun("restart"); startRun(m); })).size(200, 55).pad(4);
                    t.button("건너뛰기 (+" + SKIP_PENALTY + "초)", Icon.right, run(() => { Vars.ui.paused.hide(); if(!pending) clear("skipped"); })).size(200, 55).pad(4);
                    t.button("그만하기", Icon.cancel, run(() => { Vars.ui.paused.hide(); endRun("quit"); })).size(200, 55).pad(4);
                })).colspan(2).padTop(80);   // below the dialog's own Quit button (user 2026-11-03)
            }catch(x){ print("mindrun ui paused " + x); }
        }));
    }catch(x){ print("mindrun ui paused hook " + x); }
}

loadMusicNow();
Events.on(Packages.mindustry.game.EventType.WorldLoadEvent, cons(e => { worldLoaded = true; }));
Events.on(Packages.mindustry.game.EventType.ClientLoadEvent, cons(e => { try{ buildUi(); }catch(x){ print("mindrun ui " + x); } try{ musicSettings(); }catch(x){ logErr("music settings " + x); } }));
Events.on(Packages.mindustry.game.EventType.UnitDestroyEvent, cons(e => {
    if(!active || ctx == null || e.unit == null) return;
    if(ctx.dead != null && e.unit.type == U.crawler && e.unit.team == Team.sharded) ctx.dead++;
    if(ctx.daggersDead != null && e.unit.type == U.dagger && e.unit.team == Team.crux) ctx.daggersDead++;
}));

Events.run(Trigger.update, () => {
    try{
        if(line != null) line.setText(lineText());
        hudMission();
        musicUpdate();
        if(!active || Vars.state.isMenu()) return;
        if(pending){
            if(!worldLoaded || !Vars.state.isPlaying() || Vars.player.team().core() == null || Vars.player.dead()) return;   // wait for the player's unit too: the first clock must not run before it exists
            pending = false;
            nextMission();   // the first stage paints the bare room
            return;
        }
        if(done){ if(Date.now() >= nextAt) nextMission(); return; }
        var now = Number(java.lang.System.nanoTime());
        // the clock starts once the player's unit is really there (after a respawn from the core, e.g. leaving the router), user 2026-11-03
        if(!started){
            if(!playerReady()) return;
            started = true; elapsed = 0; lastNano = now; return;
        }
        // real time; in a run it keeps going while paused (players planned builds under pause, user 2026-11-05), practice still stops
        if(mode != "practice" || !Vars.state.isPaused()) elapsed += (now - lastNano)/1e9;
        lastNano = now;
        protectTick(ctx);
        // no shooting where a stage does not need it (user 2026-11-04): only the daggers (through a Duo) and the crawlers (their blast is their weapon) need it
        if(mission.id != "daggers" && mission.id != "crawler" && !mission.armed){ var su = Vars.player.unit(); if(su != null && !Vars.player.dead()) su.apply(SE.disarmed, 10); }
        if(mission.tick) mission.tick(ctx);
        if(mission.check(ctx)){ clear("done"); return; }
        if(LIMIT[mode] != null && total() + elapsed >= LIMIT[mode]) endRun("timeout");   // out of time: the run fails
    }catch(e){ logErr("update " + e); }
});
print("mindrun " + VERSION + " base " + BASE);
