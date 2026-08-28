#!/usr/bin/env python3
"""Deterministic chunky-pixel generator for the Study Room scene sprites.
Draws every sprite at HALF its canvas resolution, then nearest-upscales x2 so
each art pixel is a 2x2 block (effective 192x108 grid at 4x4 screen px). Keeps
the pinned 384x216 canvas + geometry contract (D-03) intact; palette = the
tokens.css hexes (D-04) + the scene-only --clay terracotta pop; no AA, no text.
Zero deps (stdlib).

Lighting is a STATIC warm state baked into bg.png (Scene Contract "one static
warm state") — dynamic dim->brighten stays Phase 25's #room-tint seam (D-18).
Wall art, rug, floor lamp are non-interactive scenery painted into bg.png (no
new hotspots). The desk chair is composited into desk.png."""
import os, struct, zlib, random

PAL = {
 'paper':(0xee,0xea,0xe1),'shadow':(0xdc,0xd5,0xc8),'card':(0xfb,0xf7,0xee),
 'wood':(0xe0,0xc7,0x9a),'deep':(0xcd,0xa8,0x6e),'ink':(0x2c,0x28,0x23),
 'soft':(0x55,0x50,0x47),'stone':(0xb7,0xb2,0xa8),'green':(0x4f,0x7b,0x43),
 'accent':(0xe8,0x50,0x3a),'clay':(0xb5,0x62,0x3a),'claylt':(0xcf,0x83,0x54),
 # 25-01 (D-04b): the ONE new hex — the night window's sky, --ink leaned
 # toward blue. Sprite art only, never chrome.
 'nightsky':(0x2b,0x2f,0x3e),
 # 26.9995-01: wood dark — SPRITES.md 8.2, approved 2026-08-06. Already in the
 # 13-hex approved set (and in the test's CHARTER_RGB); this generator simply
 # had no name for it until the desk-plate rework spent it.
 'wooddark':(0xa8,0x80,0x4f),
 # 26.9995-03: the desk scene's eight — Ruling 1, the owner, 2026-08-25
 # (SPRITES.md 8.2). Sprite art only, never chrome.
 'leaflit':(0x6f,0x9c,0x5a),   # lit side of foliage — Ruling 1, the owner, 2026-08-25
 'sage':(0x94,0xa4,0x87),      # dusty sage, silvery planting — Ruling 1, the owner, 2026-08-25
 'ceramic':(0x5f,0x7d,0x8c),   # glazed ceramic blue — THE FIRST COOL COLOUR in this
                               # palette; a deliberate temperature decision, not a
                               # drift — Ruling 1, the owner, 2026-08-25
 'ceramiclt':(0x8a,0xa3,0xae), # ceramic blue, lit side — Ruling 1, the owner, 2026-08-25
 'ceramicdk':(0x4c,0x66,0x75), # ceramic blue, dark side — Ruling 1, the owner, 2026-08-25
 'brass':(0xb0,0x8a,0x3e),     # brass, lamp fittings — Ruling 1, the owner, 2026-08-25
 'brasslt':(0xc9,0xa7,0x5c),   # brass, lit — Ruling 1, the owner, 2026-08-25
 'glass':(0xcf,0xe0,0xe2),     # glass and water — Ruling 1, the owner, 2026-08-25
 # 26.9995-04: green dark — SPRITES.md 8.2, approved 2026-08-06. Already in the
 # approved set (and in the test's CHARTER_RGB as "green-dark"); this generator
 # simply had no name for it until the ten-sprite port spent it (the design
 # kit's GDEEP — deep foliage shade on the plants). Same precedent as
 # 'wooddark' above: naming an already-approved hex, not widening the palette.
 'greendark':(0x3c,0x62,0x34),
 # 26.999: dusty rose — HER RULING, the owner, 2026-08-25, on the desk-surface
 # design canvas ("The Desk Surfaces"): the sticky note and the card-box
 # tabs. Flagged to her on the canvas as a NEW colour; her answer, verbatim:
 # "I don't really care about adding new colors from the new items, i think
 # the design system is for the UI". ⚠ That sentence is ALSO a palette-scope
 # ruling (recorded in SPRITES.md 8.2): new ITEM sprites may carry new
 # colours without a per-hex sitting; the token discipline binds UI chrome.
 # Sprite art only, never chrome, never tokens.css.
 'rose':(0xd4,0x9e,0x9e),
}
T = None

def grid(w,h,fill=T): return [[fill for _ in range(w)] for _ in range(h)]
def rect(g,x,y,w,h,c):
    for j in range(y,y+h):
        for i in range(x,x+w):
            if 0<=j<len(g) and 0<=i<len(g[0]): g[j][i]=c
def px(g,x,y,c):
    if 0<=y<len(g) and 0<=x<len(g[0]): g[y][x]=c

def double(g):
    """Expand every art pixel to a 2x2 block (a new grid; g is untouched).

    The arithmetic this exists for (26.9995-01, DESK-REDESIGN-HANDOFF.md §3):
    the station plates were authored at 384x216 and write_png doubles once, so
    a drawn station pixel was 2 device px — while every room sprite is authored
    on a 192x108-equivalent grid and doubled into the scene, making its pixels
    4 device px. That mismatch is why the owner ruled on 2026-08-22 that "the desk
    is not match with the other assets, it is different pixel style." Authoring
    a plate at 192x108 and doubling it HERE first makes the two doublings
    compose to x4: one drawn pixel and one doubled sprite pixel are finally the
    same size on screen, and the emitted PNG is still 768x432 at the same
    filename. write_png itself is untouched — it holds FINALIZED_BY_HAND, the
    single write choke point 26.98-04 seated there for all call sites."""
    return [[g[y//2][x//2] for x in range(len(g[0])*2)] for y in range(len(g)*2)]

def outline(g,c):
    h=len(g); w=len(g[0]); add=[]
    for y in range(h):
        for x in range(w):
            if g[y][x] is None:
                for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
                    nx,ny=x+dx,y+dy
                    if 0<=nx<w and 0<=ny<h and g[ny][nx] is not None and g[ny][nx]!=c:
                        add.append((x,y)); break
    for x,y in add: g[y][x]=c

# ---- 26.5-08 pixel-craft helpers (UAT fix-forward: flat fills read as
#      SVG — real pixel art needs texture noise, dither blends, stepped
#      corners, and varied grain; all seeded → regeneration deterministic)
def noise(g,x,y,w,h,c,density,seed):
    rnd=random.Random(seed)
    H=len(g); W=len(g[0])
    for j in range(y,y+h):
        for i in range(x,x+w):
            if 0<=j<H and 0<=i<W and g[j][i] is not None and rnd.random()<density:
                g[j][i]=c
def checker(g,x,y,w,h,c):
    H=len(g); W=len(g[0])
    for j in range(y,y+h):
        for i in range(x,x+w):
            if 0<=j<H and 0<=i<W and (i+j)%2==0: g[j][i]=c
def roundcorner(g,r=3,rim=None):
    H=len(g); W=len(g[0])
    for (xs,ys,dx,dy) in ((0,0,1,1),(W-1,0,-1,1),(0,H-1,1,-1),(W-1,H-1,-1,-1)):
        for a in range(r):
            for b in range(r-a):
                g[ys+dy*b][xs+dx*a]=None
        if rim:
            for a in range(r+1):
                b=r-a
                yy=ys+dy*b; xx=xs+dx*a
                if 0<=yy<H and 0<=xx<W and g[yy][xx] is not None: g[yy][xx]=rim
def grain(g,x0,x1,rows,c,seed,lmin=6,lmax=18,gap=14):
    rnd=random.Random(seed)
    H=len(g); W=len(g[0])
    for y in rows:
        i=x0+rnd.randint(0,gap)
        while i<x1:
            L=rnd.randint(lmin,lmax)
            for k in range(min(L,x1-i)):
                if 0<=y<H and 0<=i+k<W and g[y][i+k] is not None: g[y][i+k]=c
            i+=L+gap+rnd.randint(0,gap)

# ---- 26.9995-03: the desk-kit shape primitives, ported from the design's
#      kit.py (docs/DESK-REDESIGN-HANDOFF.md §1) — the vocabulary the ten new
#      sprites are drawn in. Adapted to this generator's conventions: grids of
#      RGB tuples with None for transparent, PAL values not hex strings,
#      bounds-checked writes like rect above. None of these four uses any
#      randomness, so SPRITES.md 7.4's per-site seed law does not apply to
#      them — stated here so a reader need not wonder.
def disc(g,cx,cy,rx,ry,c):
    """Filled ellipse centred on (cx,cy). The <= 1.05 threshold is kit.py's
    own, kept verbatim so ported sprites are pixel-identical to the design's
    output."""
    for y in range(cy-ry,cy+ry+1):
        for x in range(cx-rx,cx+rx+1):
            if ((x-cx+0.0)/max(rx,.5))**2+((y-cy+0.0)/max(ry,.5))**2<=1.05:
                px(g,x,y,c)

def taper(g,x0,y0,w0,h,w1,c):
    """A pot: width ramps from w0 (top row) to w1 (bottom row), each row
    centred on the w0 span — one row at a time."""
    for i in range(h):
        w=round(w0+(w1-w0)*i/max(1,h-1))
        rect(g,x0+(w0-w)//2,y0+i,w,1,c)

def blade(g,x,ybase,ht,wid,c):
    """A pointed upright leaf: rises ht rows from ybase, narrowing from wid
    to a 1px tip, centred on x."""
    for i in range(ht):
        w=max(1,round(wid*(1-i/ht)))
        rect(g,x-w//2,ybase-i,w,1,c)

def silhouette(g,c=PAL['ink']):
    """Ink on every transparent pixel orthogonally adjacent to an opaque one —
    kit.py's outline(). NAMED silhouette, NOT outline: gen_room_sprites already
    has an outline(g,c) with different semantics (it skips neighbours already
    coloured c), and overloading that name would silently change its ~30
    existing call sites."""
    h=len(g); w=len(g[0]); add=[]
    for y in range(h):
        for x in range(w):
            if g[y][x] is None:
                if any(0<=x+dx<w and 0<=y+dy<h and g[y+dy][x+dx] is not None
                       for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))):
                    add.append((x,y))
    for x,y in add: g[y][x]=c

# ---- 26.98-04: THE HAND-FINISH SKIP-GUARD (SPRITES.md 7.3, load-bearing) ----
# tests/test_sprite_geometry.py REGENERATES every file in assets/room/ before it
# asserts anything, and write_png below writes every one of them
# unconditionally. So a sprite the owner hand-finishes in Aseprite is destroyed by
# the next test run — possibly days later, by somebody who was not editing art
# at all. That is the overwrite trap 7.3 names, and this set is the hand-off
# contract between the two halves of the 50/50 loop:
#
#   THE SAME COMMIT THAT LANDS A HAND-FINISHED SPRITE ADDS ITS FILENAME HERE,
#   OR THE NEXT REGENERATION REVERTS HER WORK.
#
# Seeded EMPTY on 2026-08-24 because no sprite has been hand-finished yet —
# 7.3 says to add the mechanism with the first one, and rung D sits below this
# phase's cut line, so the mechanism lands first and the art follows.
#
# The guard is seated INSIDE write_png, keyed on the destination's basename,
# because write_png is the ONLY place in this file where bytes reach disk and it
# is shared by all 30 call sites. A guard on the dispatch loop at the bottom
# would leave every one of those call sites unguarded, and a thirty-first would
# bypass the mechanism without anyone noticing.
FINALIZED_BY_HAND = frozenset()

def write_png(path, g):
    # The skip, and the reason it also requires the file to ALREADY EXIST: a
    # typo in FINALIZED_BY_HAND must not silently delete a sprite from the
    # roster. A name in the set with nothing on disk still generates.
    _name = os.path.basename(path)
    if _name in FINALIZED_BY_HAND and os.path.exists(path):
        print('skipped %s - preserved as hand-finished (FINALIZED_BY_HAND, '
              'SPRITES.md 7.3)' % _name)
        return
    h=len(g); w=len(g[0]); W,H=w*2,h*2
    raw=bytearray()
    for y in range(H):
        raw.append(0); row=g[y//2]
        for x in range(W):
            c=row[x//2]
            raw += bytes((0,0,0,0)) if c is None else bytes((c[0],c[1],c[2],255))
    def chunk(t,d):
        cd=t+d; return struct.pack('>I',len(d))+cd+struct.pack('>I',zlib.crc32(cd)&0xffffffff)
    png=b'\x89PNG\r\n\x1a\n'
    png+=chunk(b'IHDR',struct.pack('>IIBBBBB',W,H,8,6,0,0,0))
    png+=chunk(b'IDAT',zlib.compress(bytes(raw),9))+chunk(b'IEND',b'')
    open(path,'wb').write(png)

ROOM=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','assets','room')+os.sep

def gen_bg():
    rng=random.Random(240717)
    g=grid(192,108,PAL['paper'])
    # calm even paper-wall grain
    for y in range(83):
        for x in range(60,192):
            if rng.random()<0.022: g[y][x]=PAL['shadow']
    # feature wall + vertical panelling grain
    for y in range(83):
        for x in range(60): g[y][x]=PAL['green']
    for x in range(3,60,6):
        for y in range(83):
            if rng.random()<0.6: g[y][x]=PAL['soft']
    for y in range(83):
        for x in range(60):
            if rng.random()<0.02: g[y][x]=PAL['soft']
        g[y][59]=PAL['ink']
    for x in range(192): g[83][x]=PAL['ink']
    # floor
    for y in range(84,108):
        for x in range(192): g[y][x]=PAL['wood']
    for y in (84,85):
        for x in range(192): g[y][x]=PAL['deep']
    for y in range(88,108,5):
        for x in range(192): g[y][x]=PAL['deep']
    band=0
    for y0 in range(86,108,5):
        off=rng.randrange(0,24); step=28+band%3*6
        for x in range(off,192,step):
            for y in range(y0,min(y0+4,108)): g[y][x]=PAL['deep']
        band+=1
    for y in range(86,108):
        for x in range(192):
            if g[y][x]==PAL['wood'] and rng.random()<0.02: g[y][x]=PAL['deep']

    # --- static daylight glow from the big window (WALL ONLY so the rust rug
    #     stays vivid). Window footprint half x58-100 y18-72; light spills
    #     down-right, solid core + checkerboard fade. ---
    wx0,wy0,wx1,wy1=62,22,106,66
    for y in range(0,83):
        for x in range(60,192):
            if g[y][x] not in (PAL['paper'],PAL['shadow']): continue
            if x < wx0-2 or y < wy0-2: continue
            dx = 0 if wx0<=x<=wx1 else (wx0-x if x<wx0 else x-wx1)
            dy = 0 if wy0<=y<=wy1 else (wy0-y if y<wy0 else y-wy1)
            d=(dx*dx+dy*dy)**0.5
            if d < 12: g[y][x]=PAL['card']
            elif d < 20 and (x+y)%2==0: g[y][x]=PAL['card']
            elif d < 28 and (x+y)%4==0: g[y][x]=PAL['card']

    # --- rug: bigger, terracotta pop (drawn before the lamp so the lamp
    #     stands on it) ---
    rx,ry,rw,rh=44,90,104,16
    def rrect(x,y,w,h,c):
        rect(g,x,y,w,h,c)
        for cx2,cy2 in [(x,y),(x+w-1,y),(x,y+h-1),(x+w-1,y+h-1)]: px(g,cx2,cy2,PAL['wood'])
    rrect(rx,ry,rw,rh,PAL['ink'])             # dark keyline
    rrect(rx+1,ry+1,rw-2,rh-2,PAL['clay'])    # terracotta border field
    rrect(rx+3,ry+3,rw-6,rh-6,PAL['deep'])    # inner ring
    rrect(rx+4,ry+4,rw-8,rh-8,PAL['clay'])    # main rust field
    mcx=rx+rw//2; mcy=ry+rh//2                 # centre medallion (light clay)
    for i in range(5):
        rect(g,mcx-i,mcy-4+i,1+2*i,1,PAL['claylt'])
    for i in range(4,-1,-1):
        rect(g,mcx-i,mcy+1+(4-i),1+2*i,1,PAL['claylt'])
    px(g,mcx,mcy,PAL['card'])
    for mx in (rx+12, rx+rw-14):                # woven accents
        rect(g,mx,mcy-2,3,4,PAL['claylt']); px(g,mx+1,mcy,PAL['deep'])
    for x in range(rx+2,rx+rw-2,4):             # fringe
        px(g,x,ry-1,PAL['deep']); px(g,x,ry+rh,PAL['deep'])

    # --- a small companion plant on the rug, below the window ---
    spx=50
    rect(g,spx,101,6,4,PAL['stone']); rect(g,spx,101,6,1,PAL['card']); rect(g,spx,104,6,1,PAL['deep'])
    for (x,y,w,h) in [(spx+1,97,4,4),(spx-1,98,3,3),(spx+3,98,3,3),(spx+1,95,2,3)]:
        rect(g,x,y,w,h,PAL['green'])
    px(g,spx+2,98,PAL['ink']); px(g,spx,99,PAL['ink'])
    outline_region=None  # (companion plant rides bg; no per-object outline)

    # --- wall art: framed abstract landscape, above the desk ---
    ax,ay,aw,ah=150,20,26,20
    rect(g,ax,ay,aw,ah,PAL['stone'])
    rect(g,ax+2,ay+2,aw-4,ah-4,PAL['ink'])
    rect(g,ax+3,ay+3,aw-6,ah-6,PAL['card'])
    rect(g,ax+3,ay+3,aw-6,3,PAL['shadow'])
    rect(g,ax+3,ay+ah-7,aw-6,4,PAL['green'])
    rect(g,ax+6,ay+ah-10,5,4,PAL['green'])
    rect(g,ax+13,ay+ah-11,6,5,PAL['soft'])
    write_png(ROOM+'bg.png',g)

def gen_bookshelf():
    # 26.4-08 UAT (the owner): the bookshelf is now the reflections-only insight
    # library — the ALLOWED reflections render as live in-room spines INTO these
    # recesses (renderReflectionSpines), so the sprite ships BARE: frame + four
    # shadow recesses + board lines only. No baked-in book fill, no decorative
    # card object; an empty shelf is honestly empty (law 3) until reflections
    # are allowed. The four recesses at y0 in [2,15,28,41], interior x [2..34],
    # each 12 half-res rows tall with a board line at y0+12, are the geometry
    # renderReflectionSpines' SHELF_ROWS derive from.
    # 26.4-10 UAT (the owner): a CHUNKY 2x2 shelf that matches the books — a bold
    # ink outline, a dimensional wood frame (lit top/left, shaded right/bottom),
    # and recesses with real depth (dark back-shadow + a front under-lip). The
    # load-bearing geometry is UNCHANGED so the JS book placement still lines up:
    # interior x 2..34, four recesses at y0 in [2,15,28,41] × 12 tall, each shelf
    # BOARD at y0+12 (sprite rows 14,27,40,53) — a book bottoms on the board.
    g=grid(36,56)
    rect(g,0,0,36,56,PAL['wood'])            # blonde wood frame
    rect(g,0,0,36,2,PAL['deep'])             # top rail (a touch darker)
    rect(g,0,54,36,2,PAL['deep'])            # bottom rail
    # recesses stay CLEAN + LIGHT so a book's own dark outline reads against a
    # pale field — no dark back-shadow or dividers inside to fight the books.
    for y0 in [2,15,28,41]:
        rect(g,2,y0,32,12,PAL['shadow'])     # pale recess field
        rect(g,2,y0+12,32,1,PAL['deep'])     # a simple wood shelf board
    # ONE modest ink outline on the OUTER frame only — it never touches a book
    # (books sit at x 20..84; the frame edge is at x 16/88, a gap away).
    rect(g,0,0,36,1,PAL['ink']); rect(g,0,55,36,1,PAL['ink'])
    rect(g,0,0,1,56,PAL['ink']); rect(g,35,0,1,56,PAL['ink'])
    write_png(ROOM+'bookshelf.png',g)

def gen_desk():
    g=grid(60,28)
    # top slab: highlight lip on top, hard shadow line underneath
    rect(g,0,2,60,4,PAL['wood']); rect(g,0,2,60,1,PAL['card']); rect(g,0,6,60,1,PAL['ink'])
    # right drawer pedestal
    rect(g,40,7,20,21,PAL['wood'])
    rect(g,40,7,1,21,PAL['ink'])             # kneehole-side edge
    rect(g,58,7,2,21,PAL['deep'])            # right shade
    for dy in (9,15,21):
        rect(g,43,dy,14,5,PAL['wood']); rect(g,43,dy,14,1,PAL['deep']); rect(g,43,dy+4,14,1,PAL['ink'])
        rect(g,48,dy+2,4,1,PAL['ink'])       # drawer pull
    # left leg
    rect(g,3,7,5,21,PAL['wood']); rect(g,3,7,1,21,PAL['card']); rect(g,7,7,1,21,PAL['ink'])
    rect(g,3,27,5,1,PAL['ink']); rect(g,40,27,20,1,PAL['ink'])   # feet
    # kneehole (x8..40) stays OPEN — the chair sits in it, wall/floor behind.
    # (the office chair is its own real-scale sprite; the reserved note-spot is
    #  the HTML seam, not drawn here — as a pad it read as clutter on the slab.)
    outline(g,PAL['ink']); write_png(ROOM+'desk.png',g)

# ---- office chair 26x39 (2.2ft x 3.3ft @ 24px/ft) — its own sprite,
#      placed in front of the desk; light from the upper-left ----
def gen_chair():
    g=grid(26,39)
    rect(g,7,1,12,18,PAL['soft'])              # backrest
    rect(g,7,1,2,18,PAL['stone'])              # left highlight (light upper-left)
    rect(g,17,3,2,15,PAL['ink'])               # right core shadow
    rect(g,8,1,9,2,PAL['stone'])               # headrest highlight
    rect(g,9,7,8,1,PAL['ink']); rect(g,9,12,8,1,PAL['ink'])   # lumbar seams
    rect(g,4,13,3,2,PAL['soft']); rect(g,19,13,3,2,PAL['soft'])   # armrests
    rect(g,4,15,1,4,PAL['ink']); rect(g,21,15,1,4,PAL['ink'])
    rect(g,5,19,16,4,PAL['deep'])              # seat
    rect(g,5,19,16,1,PAL['wood'])              # seat top highlight
    rect(g,5,22,16,1,PAL['ink'])               # seat front shadow
    rect(g,12,23,3,7,PAL['ink'])               # gas cylinder
    rect(g,4,30,18,1,PAL['soft'])              # 5-star base spider
    for bx in (4,8,12,16,20):                  # legs run to the castors at the sprite base
        rect(g,bx,30,1,6,PAL['soft']); rect(g,bx,36,2,3,PAL['ink'])
    outline(g,PAL['ink']); write_png(ROOM+'chair.png',g)

def gen_album():
    g=grid(20,14)
    rect(g,1,1,18,12,PAL['soft']); rect(g,1,1,3,12,PAL['ink']); rect(g,17,2,2,10,PAL['card'])
    rect(g,7,4,8,6,PAL['card']); rect(g,8,5,6,3,PAL['shadow'])
    outline(g,PAL['ink']); write_png(ROOM+'album.png',g)

def gen_journal():
    g=grid(15,7)
    rect(g,0,0,13,7,PAL['deep']); rect(g,0,0,13,1,PAL['wood'])
    rect(g,13,1,2,5,PAL['card']); rect(g,13,3,2,1,PAL['shadow']); rect(g,4,0,1,7,PAL['stone'])
    outline(g,PAL['ink']); write_png(ROOM+'journal.png',g)

def gen_candle():
    # flame painted AFTER the outline pass — light has no ink border
    # (matches the anim strip frames; see gen_candle_anim below)
    g=grid(5,11)
    px(g,2,2,PAL['ink'])
    rect(g,1,3,3,6,PAL['card']); rect(g,1,5,3,1,PAL['shadow']); rect(g,0,9,5,2,PAL['deep'])
    outline(g,PAL['ink'])
    px(g,2,0,PAL['claylt']); px(g,2,1,PAL['accent'])
    write_png(ROOM+'decor-candle.png',g)

def gen_plant():
    g=grid(13,22)
    rect(g,3,16,7,6,PAL['stone']); rect(g,3,16,7,1,PAL['card']); rect(g,3,21,7,1,PAL['deep'])
    rect(g,4,15,5,1,PAL['soft'])
    for (x,y,w,h) in [(4,9,6,6),(0,5,5,5),(8,5,5,5),(4,1,5,5),(1,11,4,4),
                      (8,10,4,4),(2,3,4,4),(7,3,4,4),(5,6,3,3)]:
        rect(g,x,y,w,h,PAL['green'])
    rect(g,6,9,1,7,PAL['green'])
    for (x,y) in [(3,7),(9,7),(6,3),(3,12),(9,12),(6,6)]: px(g,x,y,PAL['ink'])
    outline(g,PAL['ink']); write_png(ROOM+'decor-plant.png',g)

# ---- window 44x44 (a big 88x88 square window @24px/ft, SFMOMA reference).
#      Blonde-wood frame, a downtown view with a treeline, light from the
#      upper-left. 26.5-06 (SC-3): the cushioned window seat that used to
#      ride rows 54-61 of a 44x62 canvas is now its OWN sprite (gen_bench
#      below) — the window rows 0-43 are byte-identical to the shipped day
#      window; only the canvas shrank. ----
def gen_window():
    g=grid(44,44)
    # ---- the big square window ----
    rect(g,0,0,44,44,PAL['deep'])                  # blonde-wood frame
    rect(g,0,0,44,2,PAL['wood']); rect(g,0,0,2,44,PAL['wood'])     # lit top/left
    rect(g,0,42,44,2,PAL['soft']); rect(g,42,0,2,44,PAL['soft'])   # shaded
    rect(g,3,3,38,38,PAL['card'])                  # sky (no building — trees only)
    rect(g,6,6,8,2,PAL['stone']); rect(g,26,8,7,2,PAL['stone'])    # clouds
    rect(g,3,30,38,11,PAL['green'])                # hedge / ground foliage band
    for (tx,ty,tw,th) in [(3,19,11,15),(12,15,13,19),(22,18,12,16),(31,16,10,18)]:
        rect(g,tx,ty,tw,th,PAL['green'])           # a full row of overlapping tree crowns
        rect(g,tx+2,ty,tw-4,3,PAL['soft'])         # crown top shade
        rect(g,tx+tw//2,ty+th-1,1,3,PAL['ink'])    # trunk hint
    for (dx,dy) in [(7,24),(16,20),(26,23),(35,21),(10,28),(29,27)]:
        px(g,dx,dy,PAL['soft'])                    # leaf dapples
    rect(g,21,3,2,38,PAL['deep']); rect(g,3,21,38,2,PAL['deep'])   # 2x2 mullion cross
    rect(g,21,3,1,38,PAL['soft']); rect(g,3,21,38,1,PAL['soft'])
    outline(g,PAL['ink']); write_png(ROOM+'decor-window.png',g)

# ---- 26.5-06 (SC-3): the bench — the window seat split OUT into its own
#      arrangeable object. The six rects below ARE the exact seat rects
#      removed from the three window gens, translated y-54 (codegen
#      arithmetic, not hand art): a slim board with a thin terracotta
#      cushion + two short legs. 44x8 half-res -> 88x16 PNG; the cushion
#      top (row 0) IS the drawn wood things rest on — app.js
#      SCENE.surfaces[2] pins it at scene y=152 (bench --y:152). ----
def gen_bench():
    g=grid(44,8)
    rect(g,0,0,44,5,PAL['wood'])                   # the thin seat board
    rect(g,10,3,8,1,PAL['deep']); rect(g,28,4,6,1,PAL['deep'])  # 26.5-08: seat grain
    rect(g,0,0,44,2,PAL['clay'])                   # slim terracotta cushion (ties to the rug)
    rect(g,0,0,44,1,PAL['claylt'])                 # cushion highlight
    for px in range(3,42,6):
        rect(g,px,1,2,1,PAL['claylt'])             # 26.5-08: cushion piping dots
    rect(g,0,5,44,1,PAL['ink'])                    # front-edge shadow
    rect(g,4,5,2,3,PAL['deep']); rect(g,38,5,2,3,PAL['deep'])   # two SHORT legs, grounded
    outline(g,PAL['ink']); write_png(ROOM+'bench.png',g)

# ---- 25-01 (D-04b): the window's dusk + night variants — the SAME 44x44
#      half-res geometry as gen_window (88x88 after the 2x upscale), so
#      the hotspot is untouched. State, not motion: app.js swaps the
#      shipped img src to the band's variant at the room landing; the
#      variants are never posted to the layout. gen_window itself is
#      byte-untouched so the day PNG never drifts. Anchored-light craft
#      rule (D-04c) applies only if frames ever vary — these are stills.
#      26.5-06 (SC-3): both variants re-cut to 44x44 with gen_window —
#      their seat rects moved to gen_bench; variant discipline holds. ----

def gen_window_dusk():
    # dusk: the sky warmed toward claylt/clay with a low sun band above
    # the treeline and warm-lit clouds; frame and mullions exactly
    # as the day window.
    g=grid(44,44)
    rect(g,0,0,44,44,PAL['deep'])                  # blonde-wood frame
    rect(g,0,0,44,2,PAL['wood']); rect(g,0,0,2,44,PAL['wood'])     # lit top/left
    rect(g,0,42,44,2,PAL['soft']); rect(g,42,0,2,44,PAL['soft'])   # shaded
    rect(g,3,3,38,38,PAL['claylt'])                # warm dusk sky
    rect(g,3,12,38,3,PAL['clay'])                  # the low sun band
    rect(g,8,10,4,2,PAL['card'])                   # the low sun itself
    rect(g,6,6,8,2,PAL['clay']); rect(g,26,8,7,2,PAL['clay'])      # warm-lit clouds
    rect(g,3,30,38,11,PAL['green'])                # hedge / ground foliage band
    for (tx,ty,tw,th) in [(3,19,11,15),(12,15,13,19),(22,18,12,16),(31,16,10,18)]:
        rect(g,tx,ty,tw,th,PAL['green'])           # the day window's tree row
        rect(g,tx+2,ty,tw-4,3,PAL['soft'])         # crown top shade
        rect(g,tx+tw//2,ty+th-1,1,3,PAL['ink'])    # trunk hint
    for (dx,dy) in [(7,24),(16,20),(26,23),(35,21),(10,28),(29,27)]:
        px(g,dx,dy,PAL['soft'])                    # leaf dapples
    rect(g,21,3,2,38,PAL['deep']); rect(g,3,21,38,2,PAL['deep'])   # 2x2 mullion cross
    rect(g,21,3,1,38,PAL['soft']); rect(g,3,21,38,1,PAL['soft'])
    outline(g,PAL['ink']); write_png(ROOM+'decor-window-dusk.png',g)

def gen_window_night():
    # night: the sky deepened to the ink-leaning nightsky blue, a few
    # card stars, one dim cloud, and 3 lit-window flecks glowing through
    # the treeline (card/claylt); frame and mullions exactly as
    # the day window.
    g=grid(44,44)
    rect(g,0,0,44,44,PAL['deep'])                  # blonde-wood frame
    rect(g,0,0,44,2,PAL['wood']); rect(g,0,0,2,44,PAL['wood'])     # lit top/left
    rect(g,0,42,44,2,PAL['soft']); rect(g,42,0,2,44,PAL['soft'])   # shaded
    rect(g,3,3,38,38,PAL['nightsky'])              # deep night sky
    for (sx,sy) in [(9,7),(31,5),(24,12)]:
        px(g,sx,sy,PAL['card'])                    # three stars
    rect(g,6,6,8,2,PAL['soft'])                    # one dim cloud
    rect(g,3,30,38,11,PAL['green'])                # hedge / ground foliage band
    for (tx,ty,tw,th) in [(3,19,11,15),(12,15,13,19),(22,18,12,16),(31,16,10,18)]:
        rect(g,tx,ty,tw,th,PAL['green'])           # the day window's tree row
        rect(g,tx+2,ty,tw-4,3,PAL['ink'])          # night crown shade
        rect(g,tx+tw//2,ty+th-1,1,3,PAL['ink'])    # trunk hint
    for (dx,dy) in [(7,24),(16,20),(26,23),(35,21),(10,28),(29,27)]:
        px(g,dx,dy,PAL['ink'])                     # dark leaf dapples
    for (wx,wy) in [(9,26),(18,24),(33,25)]:
        rect(g,wx,wy,2,2,PAL['card'])              # lit windows through the trees
        px(g,wx+1,wy+1,PAL['claylt'])              # warm lower pane
    rect(g,21,3,2,38,PAL['deep']); rect(g,3,21,38,2,PAL['deep'])   # 2x2 mullion cross
    rect(g,21,3,1,38,PAL['soft']); rect(g,3,21,38,1,PAL['soft'])
    outline(g,PAL['ink']); write_png(ROOM+'decor-window-night.png',g)

# ---- accessory catalog v1 (24.1-04, D-05) — the design-mode dock's
#      net-new decor sprites. Same palette hexes, same half-res draw +
#      2x nearest upscale, fully deterministic (no randomness at all).
#      Coral stays OUT of sprite art — it is the chrome-only attention
#      accent (the SFMOMA discipline); the warm pop here is --clay,
#      the scene-only terracotta. ----

def gen_decor_rug():
    # A flat woven rug reading at 48x16 scene px. Colorway A is the
    # --clay terracotta (the token sheet's scene-only pop, echoing the
    # bg rug); colorway B is a --stone neutral for a quieter floor.
    for name, field, mid in (('decor-rug.png', PAL['clay'], PAL['claylt']),
                             ('decor-rug-b.png', PAL['stone'], PAL['card'])):
        g = grid(24, 8)
        rect(g, 0, 0, 24, 8, PAL['ink'])            # dark keyline edge
        rect(g, 1, 1, 22, 6, field)                 # border field
        rect(g, 3, 2, 18, 4, PAL['deep'])           # inner ring
        rect(g, 4, 3, 16, 2, field)                 # main field band
        rect(g, 11, 3, 2, 2, mid)                   # centre medallion
        px(g, 7, 4, mid); px(g, 16, 3, mid)         # woven accents
        for x in range(2, 22, 4):                   # fringe ticks
            px(g, x, 0, PAL['deep']); px(g, x, 7, PAL['deep'])
        write_png(ROOM + name, g)

def gen_decor_books():
    # A small floor stack of book spines at 20x14 scene px — mixed
    # --wood-deep / --green / --ink-soft spines with pale page edges.
    g = grid(10, 7)
    rect(g, 0, 5, 10, 2, PAL['deep'])               # bottom spine
    rect(g, 8, 5, 1, 2, PAL['card'])                # its page edge
    rect(g, 1, 3, 8, 2, PAL['green'])               # middle spine
    rect(g, 1, 3, 1, 2, PAL['card'])                # its page edge
    rect(g, 2, 1, 6, 2, PAL['soft'])                # top spine
    rect(g, 7, 1, 1, 2, PAL['card'])                # its page edge
    px(g, 4, 6, PAL['ink']); px(g, 5, 4, PAL['ink'])  # title bands
    outline(g, PAL['ink']); write_png(ROOM + 'decor-books.png', g)

# ---- 26.4-10 UAT (the owner): the reflection-book spines. STANDING pixel books
#      that speak the SAME vocabulary as the desk/decor books (gen_decor_books):
#      a flat colour spine, a pale --card fore-edge (the pages, up top since the
#      book stands spine-out), a pale title band, and a 1px --ink border (the
#      outline every room sprite carries). Six variants (colour + height) the
#      shelf cycles through by book id. Coral --accent is NOT used — it stays
#      the candle's alone. Each is 6 art-px wide (= 12 scene-px, one shelf grid
#      column, so neighbours touch but never overlap); the JS shelf mirrors the
#      per-variant heights in REFLECT_BOOK_H. ----
# 26.4-10 UAT (the owner): the shelf reflection books are drawn in the SAME chunky
# 2x2 style as the desk decor-books (gen_decor_books) — a flat colour cover, a
# cream page block on the fore-edges (right + a top cap), a small ink title
# mark, and the shared ink outline. Half-res grid → write_png's 2x upscale gives
# the 2x2-pixel chunk the rest of the room uses. Six colour/height variants;
# coral --accent excluded (candle-only). Art heights are half the on-screen
# heights in app.js REFLECT_BOOK_H ([24,20,22,18,24,20] → [12,10,11,9,12,10]).
REFLECTION_BOOK_VARIANTS = [
    ('deep', 12), ('green', 10), ('soft', 11),
    ('stone', 9), ('clay', 12), ('wood', 10),
]

def gen_reflection_books():
    # NARROW standing spines (the owner): 6 art-px wide (= 12 scene px = one shelf
    # grid column), so books stand spine-out and pack TIGHT, edge-to-edge, with
    # no gaps. Flat colour spine, a cream page-cap at the top (pages), a cream
    # title label band, and the shared ink outline — the desk decor-books style,
    # slimmed to a spine.
    for i, (color, Hart) in enumerate(REFLECTION_BOOK_VARIANTS):
        W = 6
        g = grid(W, Hart)                            # transparent margin for outline
        rect(g, 1, 1, W - 2, Hart - 2, PAL[color])   # flat colour spine face
        rect(g, 1, 1, W - 2, 1, PAL['card'])         # cream page-cap (top)
        rect(g, 2, 3, W - 4, 1, PAL['card'])         # cream title label band
        px(g, 2, Hart - 4, PAL['ink'])               # small ink mark low on spine
        outline(g, PAL['ink'])                       # shared ink outline
        write_png(ROOM + ('reflection-book-%d.png' % i), g)

def gen_decor_art():
    # A small framed wall piece at 24x20 scene px — --wood-deep frame,
    # lit top edge; variant A carries a --green field, variant B a
    # --clay field (both palette-locked, no coral).
    for name, field in (('decor-art.png', PAL['green']),
                        ('decor-art-b.png', PAL['clay'])):
        g = grid(12, 10)
        rect(g, 0, 0, 12, 10, PAL['deep'])          # blonde-deep frame
        rect(g, 0, 0, 12, 1, PAL['wood'])           # lit top edge
        rect(g, 1, 1, 10, 8, PAL['ink'])            # inner keyline
        rect(g, 2, 2, 8, 6, PAL['card'])            # pale sky field
        rect(g, 2, 5, 8, 3, field)                  # ground band
        rect(g, 4, 4, 3, 2, field)                  # low landform
        px(g, 8, 3, PAL['stone'])                   # one cloud fleck
        outline(g, PAL['ink']); write_png(ROOM + name, g)

def gen_decor_plant_b():
    # A second, smaller plant at 18x30 scene px — bushier crowns than
    # the shipped decor-plant, same pot language.
    g = grid(9, 15)
    rect(g, 2, 11, 5, 4, PAL['stone'])              # pot
    rect(g, 2, 11, 5, 1, PAL['card'])               # pot rim highlight
    rect(g, 2, 14, 5, 1, PAL['deep'])               # pot base shade
    rect(g, 3, 10, 3, 1, PAL['soft'])               # soil line
    for (x, y, w, h) in ((1, 5, 4, 5), (4, 4, 4, 5), (0, 8, 3, 3),
                         (6, 7, 3, 4), (2, 2, 5, 4), (3, 8, 3, 3)):
        rect(g, x, y, w, h, PAL['green'])           # bushy crowns
    for (x, y) in ((2, 6), (6, 5), (4, 3), (1, 9), (7, 8)):
        px(g, x, y, PAL['ink'])                     # leaf notches
    outline(g, PAL['ink']); write_png(ROOM + 'decor-plant-b.png', g)

# ---- candle film strip (25 light&time, ambient per the owner 2026-07-19):
#      6 frames of the 5x11 candle side by side (30x11 half-res -> 60x22).
#      The flame never slides: it stays anchored on the wick column and
#      breathes in HEIGHT and HEAT (card = white-hot, claylt = warm,
#      accent = coral body) — and it is painted AFTER the ink outline
#      pass, so the light has no hard border (light, not a thing). ----
def _candle_frame(flame):
    g=grid(5,11)
    px(g,2,2,PAL['ink'])
    rect(g,1,3,3,6,PAL['card']); rect(g,1,5,3,1,PAL['shadow']); rect(g,0,9,5,2,PAL['deep'])
    outline(g,PAL['ink'])
    for (x,y,c) in flame: px(g,x,y,PAL[c])
    return g

def gen_candle_anim():
    frames=[
        [(2,0,'claylt'),(2,1,'accent')],   # steady, warm tip
        [(2,0,'accent'),(2,1,'accent')],   # settle
        [(2,1,'accent')],                  # dip low
        [(2,0,'card'),(2,1,'claylt')],     # flare — white-hot tip
        [(2,0,'accent'),(2,1,'claylt')],   # warm middle
        [(2,1,'claylt')],                  # low ember
    ]
    strip=grid(30,11)
    for i,fl in enumerate(frames):
        fg=_candle_frame(fl)
        for y in range(11):
            for x in range(5):
                strip[y][i*5+x]=fg[y][x]
    write_png(ROOM+'decor-candle-anim.png',strip)

# ---- 26.4-03 (OPTIONAL, cuttable per A3): the librarian's REACHING flame.
#      A second 6-frame strip where the flame warms toward --accent coral and
#      reaches ONE row taller (the wick + body rows are byte-identical to the
#      steady strip, so the candle BODY height stays constant — only the flame
#      changes, D-23). This is the taller-flame art direction; the SHIPPED
#      reaching state uses a CSS tint over the steady strip instead (tokens.css
#      #room-obj-candle.reaching) so there is zero new-asset dependency — the
#      behavior is identical either way. To adopt the strip, add gen_candle_reach
#      to the run tuple below AND point the .reaching background-image at it. ----
def gen_candle_reach():
    frames=[
        [(2,0,'accent'),(2,1,'accent'),(2,2,'claylt')],   # tall, warm
        [(2,0,'clay'),(2,1,'accent'),(2,2,'accent')],     # taller reach
        [(2,0,'accent'),(2,1,'claylt'),(2,2,'accent')],   # flicker up
        [(2,0,'card'),(2,1,'accent'),(2,2,'claylt')],     # white-hot tip
        [(2,0,'accent'),(2,1,'accent'),(2,2,'clay')],     # deep coral
        [(2,0,'clay'),(2,1,'accent'),(2,2,'claylt')],     # settling reach
    ]
    strip=grid(30,11)
    for i,fl in enumerate(frames):
        fg=_candle_frame(fl)
        for y in range(11):
            for x in range(5):
                strip[y][i*5+x]=fg[y][x]
    write_png(ROOM+'decor-candle-reach.png',strip)

# ---- 26.5-01 (D-01/D-04): the reading-spread frame skins — codegen
#      SCAFFOLDS at blockout quality (the Aseprite finalize is plan
#      26.5-08). All three skins share ONE interior rect (SPREAD_INT,
#      half-res) that matches app.js SPREAD_INTERIOR exactly (= 2x these
#      values): skins are frame art only, never layout. Canvas 384x216
#      half-res -> write_png emits 768x432 PNG. Palette = the shipped PAL
#      hexes only. ----
SPREAD_INT=(36,42,312,150)   # x,y,w,h half-res — app.js SPREAD_INTERIOR is 2x

def _spread_base(cover):
    g=grid(384,216)
    rect(g,0,0,384,216,cover)              # the cover / frame band
    rect(g,8,8,368,200,PAL['card'])        # the page field
    x,y,w,h=SPREAD_INT
    rect(g,x,y,w,h,PAL['paper'])           # the ONE shared interior rect
    return g

def gen_spread_frame_book():
    g=_spread_base(PAL['deep'])
    x,y,w,h=SPREAD_INT
    # 26.5-08 finalize v2 (UAT fix-forward — pixel craft, not flat fills):
    # a worn bound-book cover. The whole cover band gets wood texture
    # noise + long varied grain, the page field gets paper speckle, the
    # gutter gets a dithered valley, and the outer corners are stepped
    # round with an ink rim — the pixel-art read.
    rect(g,0,0,384,8,PAL['deep']); rect(g,0,208,384,8,PAL['deep'])
    rect(g,0,0,8,216,PAL['deep']); rect(g,376,0,8,216,PAL['deep'])
    noise(g,0,0,384,8,PAL['wood'],0.22,26501)     # board texture, top
    noise(g,0,208,384,8,PAL['wood'],0.22,26502)   # board texture, bottom
    noise(g,0,0,8,216,PAL['wood'],0.22,26503)     # board texture, left
    noise(g,376,0,8,216,PAL['wood'],0.22,26504)   # board texture, right
    grain(g,10,374,(2,5,210,213),PAL['ink'],26505,lmin=4,lmax=10,gap=26)
    noise(g,8,8,368,4,PAL['shadow'],0.35,26506)   # cover→page dither lip
    noise(g,8,204,368,4,PAL['shadow'],0.35,26507)
    noise(g,12,12,360,192,PAL['shadow'],0.012,26508)  # paper speckle (card field)
    # the closed page-block peeking below the open field (stacked sheets)
    rect(g,10,196,364,1,PAL['shadow']); rect(g,12,199,360,1,PAL['stone'])
    rect(g,14,202,356,1,PAL['shadow'])
    for sx in range(16,356,17):                   # sheet-cut notches
        rect(g,sx,197,1,1,PAL['stone']); rect(g,sx+7,200,1,1,PAL['shadow'])
    # center gutter — a dithered valley, not a hairline
    checker(g,x+w//2-4,y-8,3,h+16,PAL['shadow'])
    rect(g,x+w//2-1,y-8,2,h+16,PAL['shadow'])
    checker(g,x+w//2+1,y-8,3,h+16,PAL['shadow'])
    rect(g,x-2,y+h+6,w+4,2,PAL['shadow'])         # stacked page-edge shadow
    rect(g,0,0,384,1,PAL['ink']); rect(g,0,215,384,1,PAL['ink'])  # drawn rim
    rect(g,0,0,1,216,PAL['ink']); rect(g,383,0,1,216,PAL['ink'])
    roundcorner(g,4,PAL['ink'])                   # stepped round corners
    outline(g,PAL['ink'])                         # binding rim hugs the steps
    write_png(ROOM+'spread-frame-book.png',g)

def gen_spread_frame_album():
    g=_spread_base(PAL['clay'])
    x,y,w,h=SPREAD_INT
    # 26.5-08 finalize v2 (UAT fix-forward — pixel craft): a cloth 手帐
    # album cover — clay band with woven texture noise, running stitch,
    # dithered inner lip, paper speckle, stepped round corners.
    noise(g,0,0,384,8,PAL['claylt'],0.14,26510)   # woven cloth, top band
    noise(g,0,208,384,8,PAL['claylt'],0.14,26511)
    noise(g,0,0,8,216,PAL['claylt'],0.14,26512)
    noise(g,376,0,8,216,PAL['claylt'],0.14,26513)
    for sx in range(6,378,8):                    # stitch dashes, top + bottom
        rect(g,sx,4,4,1,PAL['claylt']); rect(g,sx,211,4,1,PAL['claylt'])
    for sy in range(6,210,8):                    # stitch dashes, both sides
        rect(g,3,sy,1,4,PAL['claylt']); rect(g,380,sy,1,4,PAL['claylt'])
    noise(g,8,8,368,3,PAL['shadow'],0.3,26514)   # cover→page dither lip
    noise(g,8,205,368,3,PAL['shadow'],0.3,26515)
    noise(g,12,12,360,192,PAL['shadow'],0.012,26516)  # paper speckle
    checker(g,x+w//2-3,y-8,2,h+16,PAL['shadow']) # soft dithered gutter
    rect(g,x+w//2-1,y-8,2,h+16,PAL['shadow'])
    checker(g,x+w//2+1,y-8,2,h+16,PAL['shadow'])
    # drawn photo-corner MOUNTS at the interior's corners — L-shaped
    # polaroid corners (same anchors as the scaffold squares, OMORI family)
    for (cx,cy,dx,dy) in ((x-5,y-5,0,0),(x+w-1,y-5,4,0),(x-5,y+h-1,0,4),(x+w-1,y+h-1,4,4)):
        rect(g,cx,cy+dy,6,2,PAL['claylt'])       # the horizontal arm
        rect(g,cx+dx,cy,2,6,PAL['claylt'])       # the vertical arm
        rect(g,cx+dx+ (0 if dx else 1),cy+dy+(0 if dy else 1),1,1,PAL['ink'])  # mount pin
    rect(g,0,0,384,1,PAL['ink']); rect(g,0,215,384,1,PAL['ink'])  # drawn rim
    rect(g,0,0,1,216,PAL['ink']); rect(g,383,0,1,216,PAL['ink'])
    roundcorner(g,4,PAL['ink'])
    outline(g,PAL['ink'])
    write_png(ROOM+'spread-frame-album.png',g)

def gen_spread_frame_paper():
    g=_spread_base(PAL['shadow'])
    x,y,w,h=SPREAD_INT
    # 26.5-08 finalize v2 (UAT fix-forward — pixel craft): a loose sheet
    # on a felt blotter — blotter texture noise, dithered sheet drop
    # shadow, jittered deckle edge, paper speckle, soft round corners.
    noise(g,0,0,384,8,PAL['stone'],0.18,26520)    # felt blotter texture
    noise(g,0,208,384,8,PAL['stone'],0.18,26521)
    noise(g,0,0,8,216,PAL['stone'],0.18,26522)
    noise(g,376,0,8,216,PAL['stone'],0.18,26523)
    rnd=random.Random(26524)                      # jittered deckle edge
    for dx in range(9,375,3):
        if rnd.random()<0.6: rect(g,dx,8,2,1,PAL['stone'])
        if rnd.random()<0.6: rect(g,dx+1,207,2,1,PAL['stone'])
    checker(g,8,205,368,3,PAL['stone'])           # dithered under-sheet shadow
    checker(g,373,10,3,196,PAL['stone'])
    noise(g,12,12,360,192,PAL['shadow'],0.014,26525)  # paper speckle
    rect(g,x-2,y-2,w+4,1,PAL['stone'])   # a plain sheet's soft top edge
    roundcorner(g,3)
    write_png(ROOM+'spread-frame-paper.png',g)

# ---- the desk STATION background — 26.9995-01 rework: authored 192x108,
#      double()d here to 384x216, doubled again by write_png -> 768x432 PNG.
#      One drawn pixel is now 4 device px, the same size as a doubled room
#      sprite pixel (the mismatch the owner named 2026-08-22: "different pixel
#      style"; DESK-REDESIGN-HANDOFF.md §3). Scenery ONLY: the blessing
#      stack, the drawer, the hosted candle slot and the two reserved spots
#      are DOM elements app.js positions over this art — nothing drawn here
#      is a hotspot. The geometry contract with app.js STATION_DESK, stated
#      in 384-space (halve for this 192-grid): slab top line y=120 (row 60
#      here — Plan 05 owns any coordinate that actually moves), stack pile
#      around x 84-134, drawer face x 240-324 / y 150-194, session mat
#      x 12-72,
#      notebook seat x 146-202 / y 76-120 (26.999 night, her desk pass:
#      the room's own notebook.png renders on the seat at the station's 2x
#      — 28x22 room units -> 56x44 — bottom on the slab line, "the
#      blessing journal is not matched with the journal in the room". The
#      drawn blank mat x 160-200 / y 106-120 REMAINS in this art,
#      deliberately: the seated sprite covers it whole, and the plate
#      stays byte-identical rather than regenerated for a mat nobody can
#      see. Predecessor seat, retained: x 160-200 / y 100-120, the
#      blank-mat outline),
#      first-look seat x 316-364 / y 92-120 (#150, 2026-08-25, MOVED the
#      same evening by her visual ruling: the wall sentence is REMOVED and
#      the door becomes a small stack of papers on the desk line, right of
#      the candle — paper-stack.png is the whole visible render, the aria
#      name keeps her chosen words. Predecessor, retained per SC-8: wall
#      seat x 112-272 / y 24-48, label-only),
#      card-box seat x 204-264 / y 64-120 (26.999, 2026-08-25: the
#      librarian's memory of you, her design sitting — the sprite is its
#      own render (cardbox.png, seated on the y=120 line), so nothing is
#      drawn into the plate for it; the seat is stated here so the
#      cross-file agreement holds it exactly like the others),
#      pen-cup seat x 268-296 / y 76-120 (26.99955-08, 2026-08-26, her
#      ruling: the ONE door to the activity log, which leaves the Manage
#      dashboard for the room — "On the desk, near the candle." It sits in
#      the gap between the card-box seat (ends 264) and the hosted candle
#      slot (starts 300). The card box's arrangement exactly: pen-cup.png
#      is its own render at the station's 2x — 14x22 room units -> 28x44,
#      bottom on the slab line — so NOTHING is drawn into the plate for it
#      and this art stays byte-identical, unregenerated).
#
#      COLOURS — the snap map (26.9995-01). The design source
#      (design-canvas/study-room-desk/draw_plate.py) derives six tones via
#      mixc() that are NOT in the approved 13-hex set (SPRITES.md §2 + §8.2);
#      §5 of the handoff forbids near-misses of an approved hex, and only
#      the owner can widen the palette. Each derived tone ships snapped onto an
#      already-approved hex; Plan 02 puts the fidelity question to her from a
#      render of what actually shipped:
#        HI      #fdfaf3 -> PAL['card']     #fbf7ee (near-miss, refused §5)
#        LIGHT   #d9bb89 -> PAL['wood']     #e0c79a (--btn-bg)
#        MID     #d5b681 -> PAL['wood']     #e0c79a (--btn-bg)
#        DARK    #ba9a68 -> PAL['wooddark'] #a8804f (§8.2, approved 08-06)
#        DEEPER  #a98e62 -> PAL['soft']     #555047 (--ink-soft)
#        topface #ecddc0 -> PAL['card']     #fbf7ee (--card)
#      Everything else was already drawn in approved keys (paper, shadow,
#      deep, ink, stone). §7.1's furniture register ("deep + wood, long
#      varied grain + rare ink knots") is exactly this set.
def _desk_station_grid():
    # The desk-station drawing, extracted verbatim (26.9995-07) so the DAY
    # plate and the NIGHT plate are the same drawing — gen_desk_station_night
    # below re-lights this grid, it never redraws it. Day output byte-identical
    # to the pre-refactor generator (the regeneration suite holds that pin).
    W,H=192,108
    DESK_TOP=60          # objects stand on this row (y=120 in 384-space)
    g=grid(W,H,PAL['paper'])
    def hline(y,x0,x1,c): rect(g,x0,y,x1-x0,1,c)
    def vline(x,y0,y1,c): rect(g,x,y0,1,y1-y0,c)
    def box(x0,y0,x1,y1,c): rect(g,x0,y0,x1-x0,y1-y0,c)

    # -- wall: tongue-and-groove boards, a light edge beside each seam --------
    box(0,0,W,DESK_TOP,PAL['paper'])
    for x in range(0,W,16):
        vline(x,0,DESK_TOP,PAL['shadow'])
        vline(x+1,0,DESK_TOP,PAL['card'])
    rnd=random.Random(26537)                     # wall speckle (7.4 per-site)
    for _ in range(34):
        px(g,rnd.randrange(2,W-2),rnd.randrange(2,DESK_TOP-4),PAL['shadow'])
    hline(DESK_TOP-1,0,W,PAL['shadow'])          # a shade cooler at the desk

    # -- the desk -------------------------------------------------------------
    hline(DESK_TOP,0,W,PAL['ink'])               # the silhouette objects stand on
    hline(DESK_TOP+1,0,W,PAL['card'])            # lit back edge (HI -> card)
    box(0,DESK_TOP+2,W,DESK_TOP+4,PAL['wood'])   # the top face
    hline(DESK_TOP+4,0,W,PAL['card'])            # the lit front lip
    hline(DESK_TOP+5,0,W,PAL['ink'])             # under the lip
    box(0,DESK_TOP+6,W,97,PAL['deep'])           # the front panel

    # value first: lighter under the lit lip, darker toward the floor, a
    # two-row checkerboard where the values meet (the room's dither habit)
    hline(DESK_TOP+6,0,W,PAL['soft'])            # the overhang's cast shadow
    box(0,DESK_TOP+7,W,DESK_TOP+12,PAL['wood'])  # the band catching lip light
    checker(g,0,DESK_TOP+12,W,2,PAL['wood'])     # checker where it lifts
    box(0,88,W,95,PAL['wooddark'])               # the foot, in shade
    checker(g,0,86,W,2,PAL['wooddark'])
    box(0,95,W,97,PAL['soft'])                   # the deepest rows

    # grain: long strokes that wander a row and break into gaps — mostly the
    # mid tone, a few light, a few dark; never a scatter of dots. LIGHT and
    # MID both snap to 'wood', DARK to 'wooddark' (the snap map above).
    rnd=random.Random(26538)                     # front-panel grain (7.4)
    for _ in range(22):
        gy=rnd.randrange(DESK_TOP+8,94)
        r=rnd.random()
        tone=PAL['wooddark'] if 0.30<=r<0.55 else PAL['wood']
        x=rnd.randrange(0,W-24)
        end_x=min(W-1,x+rnd.randrange(22,64))
        while x<end_x:
            seg=rnd.randrange(5,14)
            hline(gy,x,min(end_x,x+seg),tone)
            x+=seg+rnd.randrange(2,6)
            if rnd.random()<0.20: gy=max(DESK_TOP+8,min(93,gy+rnd.choice((-1,1))))

    # knots: a dark eye with a ring around it, the grain parting either side
    # (§7.1's "rare ink knots" — the eye is ink so it survives the snap that
    # merged the design's DEEPER ring tone into 'soft')
    for (kx,ky) in ((36,79),(100,72),(176,84)):
        px(g,kx,ky,PAL['ink']); px(g,kx+1,ky,PAL['ink'])
        px(g,kx,ky+1,PAL['ink']); px(g,kx+1,ky+1,PAL['ink'])
        for dx,dy in ((-1,0),(-1,1),(2,0),(2,1),(0,-1),(1,-1),(0,2),(1,2)):
            px(g,kx+dx,ky+dy,PAL['soft'])
        hline(ky-2,kx-5,kx-1,PAL['wooddark']); hline(ky-2,kx+3,kx+7,PAL['wooddark'])
        hline(ky+3,kx-6,kx-1,PAL['wooddark']); hline(ky+3,kx+3,kx+8,PAL['wooddark'])

    # the desk's own ends, so it reads as a piece of furniture
    vline(0,DESK_TOP+6,97,PAL['soft']);   vline(1,DESK_TOP+6,97,PAL['wooddark'])
    vline(W-1,DESK_TOP+6,97,PAL['soft']); vline(W-2,DESK_TOP+6,97,PAL['wooddark'])
    hline(97,0,W,PAL['ink'])                     # bottom silhouette

    # the top face gets grain too, finer and lighter (topface -> card)
    rnd=random.Random(26539)                     # top-face grain (7.4)
    for i in range(9):
        gx=rnd.randrange(2,W-14)
        hline(DESK_TOP+2 if i%2 else DESK_TOP+3,gx,gx+rnd.randrange(5,16),PAL['card'])

    # -- the drawer (240,150,84x44 in plate space) — furniture machinery:
    #    outline, bevel, a pull, grain of its own, and a cast shadow ----------
    dx0,dy0,dx1,dy1=120,75,162,97
    box(dx0,dy0,dx1,dy1,PAL['wood'])
    hline(dy0,dx0,dx1,PAL['ink']); hline(dy1-1,dx0,dx1,PAL['ink'])
    vline(dx0,dy0,dy1,PAL['ink']); vline(dx1-1,dy0,dy1,PAL['ink'])
    hline(dy0+1,dx0+1,dx1-1,PAL['card'])         # bevel: light at the top
    hline(dy1-2,dx0+1,dx1-1,PAL['deep'])         # dark at the bottom
    rnd=random.Random(26546)                     # drawer grain (7.4)
    for _ in range(10):
        gx=rnd.randrange(dx0+3,dx1-6)
        hline(rnd.randrange(dy0+3,dy1-3),gx,gx+3,PAL['deep'])
    for y in range(dy0+1,dy1+2):                 # cast shadow, right side
        px(g,dx1,y,PAL['soft']); px(g,dx1+1,y,PAL['wooddark'])
    hline(dy1,dx0+1,dx1+2,PAL['soft']); hline(dy1+1,dx0+2,dx1+2,PAL['wooddark'])
    hb0,hb1=dx0+15,dx0+27                        # the pull
    box(hb0,dy0+9,hb1,dy0+13,PAL['card'])
    hline(dy0+9,hb0,hb1,PAL['ink']); hline(dy0+12,hb0,hb1,PAL['ink'])
    vline(hb0,dy0+9,dy0+13,PAL['ink']); vline(hb1-1,dy0+9,dy0+13,PAL['ink'])

    # -- floor beneath the desk, with contact shadow and board lines ----------
    box(0,98,W,H,PAL['deep'])
    hline(98,0,W,PAL['soft'])                    # the desk's contact shadow
    for y in (101,105):
        hline(y,0,W,PAL['soft'])
        hline(y+1,0,W,PAL['wood'])
    rnd=random.Random(26547)                     # floor grain (7.4)
    for _ in range(20):
        gx=rnd.randrange(2,W-9)
        hline(rnd.randrange(99,H-1),gx,gx+rnd.randrange(4,10),PAL['wood'])

    # -- the three drawn affordances, carried forward from the shipped plate
    #    at the same place in 384-space (coordinates halved). Scenery only:
    #    app.js positions real DOM elements over all three. ------------------
    # reserved spot (D-17): the 26.7 reflection-session space — a cleared
    # mat on the slab's left, drawn and deliberately empty.
    box(6,54,36,DESK_TOP,PAL['shadow'])
    hline(54,6,36,PAL['stone'])
    # the blessing stack (D-15): a small drawn pile of papers resting on the
    # slab — pile art only, NO counts, NO list of what waits (law 3).
    box(43,58,67,DESK_TOP,PAL['shadow'])         # resting shadow
    box(42,55,66,59,PAL['card']);  hline(58,42,66,PAL['shadow'])
    box(44,52,66,55,PAL['paper']); hline(55,44,66,PAL['shadow'])
    box(43,50,66,52,PAL['card']);  hline(52,43,66,PAL['shadow'])
    hline(50,43,66,PAL['ink'])                   # the top sheet's edge
    # reserved spot (D-17): the 26.8 blessings-notebook resting spot — a
    # blank notebook-shaped outline, drawn and deliberately empty.
    box(80,53,100,DESK_TOP,PAL['shadow'])
    hline(53,80,100,PAL['stone']); hline(59,80,100,PAL['stone'])
    vline(80,53,DESK_TOP,PAL['stone']); vline(99,53,DESK_TOP,PAL['stone'])

    return g

def gen_desk_station():
    write_png(ROOM+'desk-station.png',double(_desk_station_grid()))

def gen_desk_station_night():
    # -- the desk station's EVENING plate (26.9995-07) ------------------------
    # HER RULING, the owner, 2026-08-25 (R-7, tools/ROOM-HANDOFF.md): the desk
    # zoom gets an evening. The 21 night shades this pass produces were the
    # designed palette STOP (T-26.9995-37) — she APPROVED them on 2026-08-25
    # with the render open on her screen (26.9995-07-night-shades.png, day
    # plate beside night plate at real size, planning tracker's phase folder);
    # her verbatim selection: "Yes — ship the evening". The 21 hexes are
    # recorded with that provenance in SPRITES.md 8.2 and pinned by pixel
    # count in the R-7 record.
    #
    # The register, verbatim from the design's baked lighting (light.py,
    # ~/design-canvas/study-room-desk — read-only source): ONE
    # flat ink dim at 0.46 over the whole plate, then the candle lifts two
    # warm zones out of it with a CHECKERBOARD edge (radii 34/66; a smooth
    # radial glow was tried first and rejected — it banded into rings and
    # read as a different medium), wall light clipped at the desk line y=120,
    # and a stepped lit strip on the desk's front edge under the flame. The
    # flame sits at the SHIPPED candle slot x=300 (the design authored its
    # flame at x=216; app.js seats the real candle at x300 — §3's note-spot
    # row). Snapped output, NO ramp-quantise: every mix goes through snap()
    # (channels on a 12-step), which is why the day ink #2c2823 CANNOT
    # survive — 44 is not a multiple of 12; the outline rides through the dim
    # as #302424, the night register's own ink (see the outline gate's night
    # mapping in tests/test_sprite_geometry.py).
    #
    # Baked art, per DESK-REDESIGN-HANDOFF.md §6: no runtime lighting code
    # anywhere — app.js only CHOOSES between the two plates on the
    # landing-set body.time-* class. No randomness in this pass (the dither
    # is a deterministic checkerboard), so SPRITES.md 7.4's per-site seed law
    # has no call site here — stated so a reader need not wonder.
    INKC=(44,40,35); WARM=(240,214,166); HIC=(253,250,243)
    def nmix(c,t,k): return tuple(round(c[i]+(t[i]-c[i])*k) for i in range(3))
    def nsnap(c): return tuple(min(252,max(0,round(v/12)*12)) for v in c)
    g=double(_desk_station_grid())            # 384x216 — the design's space
    W,H=384,216
    FLAME=(300,96)
    # 1. one flat ink dim over the whole plate
    for y in range(H):
        for x in range(W):
            g[y][x]=nsnap(nmix(g[y][x],INKC,0.46))
    # 2. the two lifted zones, checkerboard edge, clipped at the desk line
    IN_R,OUT_R=34,66
    for y in range(120):                      # light falls on the wall, not
        for x in range(W):                    # down the desk front
            d=(((x-FLAME[0])/1.0)**2+((y-FLAME[1])/0.78)**2)**0.5
            if d>OUT_R+2: continue
            dither=((x//2+y//2)%2==0)
            if d<=IN_R:      k=0.30
            elif d<=IN_R+2:  k=0.30 if dither else 0.16
            elif d<=OUT_R:   k=0.16
            elif dither:     k=0.08
            else: continue
            g[y][x]=nsnap(nmix(g[y][x],WARM,k))
    # 3. the lit strip of desk edge, stepped on the grid, under the flame
    for i,(ww,kk) in enumerate(((76,0.75),(52,0.5),(30,0.3))):
        for y in range(124+i*2,126+i*2):
            for x in range(FLAME[0]-ww//2,FLAME[0]+ww//2):
                if 0<=x<W and 0<=y<H:
                    g[y][x]=nsnap(nmix(g[y][x],HIC,kk*0.8))
    write_png(ROOM+'desk-station-night.png',g)

# ---- the shelf STATION background 384x216 half-res -> 768x432 PNG
#      (26.5-09 UAT F1, the owner: the shelf station floated transparent
#      rails + spines over the dimmed room — it gets the desk-station
#      treatment: a drawn immersive backdrop). The zoomed reflections
#      library: the room's warm green feature wall (the bookshelf wall)
#      above a full-frame blonde-wood shelf case — side panels, top rail,
#      plinth, and a pale back panel per recess so a spine's own dark
#      outline reads against a light field (the gen_bookshelf recess
#      rule, zoomed). GEOMETRY CONTRACT with app.js renderShelfStation:
#      the four drawn shelf boards sit at EXACTLY the DOM rail lines
#      (STATION_BOARD_YS = [56,104,152,200] scene px, 4 px thick, full
#      width) so the .station-board divs and the drawn boards coincide;
#      spines stand on x 28..356 (STATION_X0/X1) inside the recesses.
#      Scenery ONLY: the spines and the hosted candle slot are DOM
#      elements app.js positions over this art — nothing drawn here is a
#      hotspot. Craft per SPRITES.md §7: texture noise on wall and wood,
#      dither only at shading boundaries, varied seeded grain — every
#      call site carries its own fixed literal seed (determinism law).
def gen_shelf_station():
    g=grid(384,216)
    # the green feature wall band above the case — plaster tooth + quiet
    # seam notches (§7.1 wall register), never a flat fill
    rect(g,0,0,384,10,PAL['green'])
    noise(g,0,0,384,10,PAL['soft'],0.03,26550)
    for x in range(11,384,24):
        rect(g,x,0,1,10,PAL['soft'])
    # the case: top rail (lit lip + ink underline), then the plinth the
    # bottom board rests over — the desk-station base-band vocabulary
    rect(g,0,10,384,6,PAL['wood'])
    rect(g,0,10,384,1,PAL['card'])
    rect(g,0,15,384,1,PAL['ink'])
    grain(g,4,380,(11,13),PAL['deep'],26551,lmin=8,lmax=24,gap=18)
    rect(g,0,205,384,11,PAL['wood'])
    rect(g,0,205,384,1,PAL['card'])
    grain(g,4,380,(208,211),PAL['deep'],26552,lmin=8,lmax=24,gap=16)
    checker(g,0,212,384,2,PAL['deep'])          # dither into the base shade
    rect(g,0,214,384,2,PAL['soft'])
    noise(g,0,214,384,2,PAL['ink'],0.15,26553)
    # the two side panels (y16..204) — wood tooth + long varied VERTICAL
    # grain strokes (§7.2: staggered, random length, never even dashes)
    for x0 in (0,368):
        rect(g,x0,16,16,188,PAL['wood'])
    noise(g,0,16,16,188,PAL['deep'],0.05,26554)
    noise(g,368,16,16,188,PAL['deep'],0.05,26555)
    rnd=random.Random(26556)
    for xg in (3,7,11,372,376,380):
        y=18+rnd.randint(0,12)
        while y<200:
            L=rnd.randint(6,20)
            rect(g,xg,y,1,min(L,200-y),PAL['deep'])
            y+=L+8+rnd.randint(0,16)
    rect(g,15,16,1,188,PAL['deep'])             # inner edges, shaded
    rect(g,368,16,1,188,PAL['deep'])
    rect(g,0,16,1,188,PAL['card'])              # lit outer-left edge
    rect(g,383,16,1,188,PAL['soft'])            # shaded outer-right edge
    # the four recesses (back panel per row): CLEAN + LIGHT fields so a
    # book's dark outline reads (the gen_bookshelf recess rule) — quiet
    # paper tooth + a 2px under-rail/under-board dither at each top edge
    for i,(y0,y1) in enumerate(((16,56),(60,104),(108,152),(156,200))):
        rect(g,16,y0,352,y1-y0,PAL['shadow'])
        noise(g,16,y0,352,y1-y0,PAL['stone'],0.012,26560+i)
        checker(g,16,y0,352,2,PAL['stone'])
    # the four boards — EXACTLY the DOM rail lines (56/104/152/200, 4px,
    # full width; the .station-board divs sit over these). A lit front
    # lip above, board texture on the face, an ink under-edge shadow.
    for j,by in enumerate((56,104,152,200)):
        rect(g,0,by-1,384,1,PAL['wood'])
        rect(g,0,by,384,4,PAL['deep'])
        noise(g,0,by,384,4,PAL['wood'],0.2,26570+j)
        rect(g,0,by+4,384,1,PAL['ink'])
    write_png(ROOM+'shelf-station.png',g)

# ---- the album STATION background 384x216 half-res -> 768x432 PNG
#      (26.5-04, D-11/D-12 — blockout quality; Aseprite finalize is
#      26.5-08). The OMORI-family open album: a clay cover band, two
#      visible pages, and drawn polaroid corner marks at the 3+3 photo
#      slots. Scenery ONLY: photos, captions, flips, and the pile are DOM
#      elements app.js positions over this art. The geometry contract
#      with app.js STATION_ALBUM_GEOM: page interior left edges x=18
#      (left) / x=202 (right), slot top lines y=24/88/152, photo rect
#      dx=4 w=60 h=44 (scene units). ----
def gen_album_page():
    g=grid(384,216)
    rect(g,0,0,384,216,PAL['clay'])                # the album cover band
    rect(g,12,10,180,196,PAL['card'])              # left page sheet edge
    rect(g,14,12,176,192,PAL['paper'])             # left page field
    rect(g,192,10,180,196,PAL['card'])             # right page sheet edge
    rect(g,194,12,176,192,PAL['paper'])            # right page field
    rect(g,190,10,4,196,PAL['shadow'])             # the center gutter
    # 26.5-08 v2 (UAT fix-forward — pixel craft): woven clay cover, paper
    # tooth on the pages, dithered gutter valley, stitched band
    noise(g,0,0,384,10,PAL['claylt'],0.14,26540)  # cloth cover, top band
    noise(g,0,206,384,10,PAL['claylt'],0.14,26541)
    noise(g,0,0,12,216,PAL['claylt'],0.14,26542)
    noise(g,372,0,12,216,PAL['claylt'],0.14,26543)
    noise(g,14,12,176,192,PAL['shadow'],0.014,26544)  # left page tooth
    noise(g,194,12,176,192,PAL['shadow'],0.014,26545) # right page tooth
    checker(g,186,10,4,196,PAL['shadow'])             # gutter dither, left
    checker(g,194,10,4,196,PAL['shadow'])             # gutter dither, right
    rect(g,189,10,1,196,PAL['stone']); rect(g,194,10,1,196,PAL['stone'])
    rect(g,16,205,172,1,PAL['stone']); rect(g,196,205,172,1,PAL['stone'])
    for sx in range(6,378,8):
        rect(g,sx,4,4,1,PAL['claylt']); rect(g,sx,210,4,1,PAL['claylt'])
    for sy in range(8,206,8):
        rect(g,4,sy,1,4,PAL['claylt']); rect(g,379,sy,1,4,PAL['claylt'])
    rect(g,0,0,384,1,PAL['ink']); rect(g,0,215,384,1,PAL['ink'])  # drawn rim
    rect(g,0,0,1,216,PAL['ink']); rect(g,383,0,1,216,PAL['ink'])
    roundcorner(g,4,PAL['ink'])
    # drawn polaroid corner MOUNTS at each of the 3+3 photo slots —
    # L-shaped corners at the same scaffold anchors (OMORI/Basil family)
    for px0 in (18,202):
        for y in (24,88,152):
            x=px0+4
            for (cx,cy,dx,dy) in ((x-3,y-3,0,0),(x+57,y-3,4,0),(x-3,y+41,0,4),(x+57,y+41,4,4)):
                rect(g,cx,cy+dy,6,2,PAL['claylt'])
                rect(g,cx+dx,cy,2,6,PAL['claylt'])
    write_png(ROOM+'album-page.png',g)

# ---- 26.8-05 (sprite pass, D-14/D-15): the blessings notebook set —
#      the three assets whose recorded fallback routes this pass
#      retires. The 手帐 register throughout: kraft/warm CLOTH covers
#      (clay+claylt, §7.1 cloth row), running stitch, washi, deliberately
#      NOT the journal's blonde-wood-and-stone look (the D-14
#      "different book at a glance" read). No coral anywhere in these
#      fills; no text; every random call seeded (determinism law §7.4).

def gen_notebook():
    # the CLOSED 手帐 on the desk — F2 (26.8.1-04): grown from 22x16 to
    # 28x22 scene px (grid 14x11 -> 2x) for desk-scale legibility. A clear
    # BOUND-BOOK silhouette so it reads as a notebook, not a slab: a
    # wood/deep SPINE band down the left long edge, a warm clay cloth 手帐
    # cover with a running-stitch margin, a card cover LABEL PLATE with a
    # 1px --ink rim (the "journal cover" read at a glance), a dark elastic
    # closure strap near the fore-edge, and a card page-block fore-edge on
    # the right. Bottom seats on the desk line (index.html --y 94 + --h 22
    # = surface 116). No coral; no text; every random call seeded (§7.4).
    g=grid(14,11)
    rect(g,0,0,12,11,PAL['clay'])                # kraft cloth cover field
    rect(g,2,0,10,1,PAL['claylt'])               # top lip highlight
    noise(g,2,1,10,9,PAL['claylt'],0.13,26810)   # cloth tooth (§7.1)
    # the SPINE — 26.999 (her approved canvas, "The Desk Surfaces"): the
    # spine band goes CLOTH-SMOOTH — the same clay, kept free of tooth, so
    # the binding reads as bound cloth against the noisy cover rather than
    # a wood board (the canvas's one flavour change to this sprite). The
    # hinge crease stays so the silhouette still reads bound (F2), and the
    # stitch nicks stay.
    rect(g,0,0,2,11,PAL['clay'])                 # spine band, smooth clay
    rect(g,1,0,1,11,PAL['claylt'])               # spine hinge crease, lit
    for y in (2,4,6,8): px(g,0,y,PAL['claylt'])  # spine stitch nicks
    for y in (3,5,7): px(g,3,y,PAL['claylt'])    # running stitch, cover margin
    # the cover LABEL PLATE — a card patch with a 1px --ink rim (手帐 label)
    rect(g,5,3,5,5,PAL['card'])                  # label plate ground
    rect(g,5,3,5,1,PAL['ink']); rect(g,5,7,5,1,PAL['ink'])   # rim top/bottom
    rect(g,5,3,1,5,PAL['ink']); rect(g,9,3,1,5,PAL['ink'])   # rim left/right
    px(g,6,4,PAL['paper'])                       # inner sheen
    rect(g,6,5,3,1,PAL['stone'])                 # a quiet title rule (no text)
    px(g,7,6,PAL['clay'])                        # small warm emblem dot
    rect(g,10,0,1,11,PAL['soft'])                # dark elastic closure strap
    # the page block fore-edge on the right long side
    rect(g,12,1,2,9,PAL['card'])                 # cream page block
    rect(g,12,3,2,1,PAL['shadow'])               # sheet split line
    rect(g,12,6,2,1,PAL['shadow'])               # sheet split line
    g[0][0]=None; g[10][0]=None                  # stepped cover corners (r=1)
    outline(g,PAL['ink'])
    write_png(ROOM+'notebook.png',g)

def gen_notebook_station():
    # the OPEN 手帐 station background 384x216 half-res -> 768x432 PNG
    # (the desk/shelf-station idiom). Kraft/clay cover band + cream
    # pages WARMER and ROUGHER than spread-frame-book's (paper-tone
    # speckle at 0.02 vs the journal's cool shadow 0.012), an exposed
    # kettle-stitch gutter and running stitch on the cover margin — the
    # visible-stitching "different book" read (D-14). GEOMETRY CONTRACT
    # with app.js STATION_NOTEBOOK_GEOM: pages at pageX 18/202, content
    # dx 8..152; the calendar day grid spans x30..174 y56..159 on the
    # left page. CONTRAST GATE (UI-SPEC sprite-art acceptance): that
    # day-grid area is re-laid to clean --card with barely-there
    # paper-tone tooth ONLY, so --ink-soft unlit numbers hold ~6.5:1.
    g=grid(384,216)
    rect(g,0,0,384,216,PAL['clay'])              # kraft cloth cover
    noise(g,0,0,384,10,PAL['claylt'],0.16,26820) # cloth tooth, four bands
    noise(g,0,206,384,10,PAL['claylt'],0.16,26821)
    noise(g,0,0,10,216,PAL['claylt'],0.16,26822)
    noise(g,374,0,10,216,PAL['claylt'],0.16,26823)
    for sx in range(6,378,6):                    # running stitch, denser than
        rect(g,sx,3,3,1,PAL['card'])             # the album's 8-pitch (D-14)
        rect(g,sx,212,3,1,PAL['card'])
    for sy in range(6,210,6):
        rect(g,3,sy,1,3,PAL['card']); rect(g,380,sy,1,3,PAL['card'])
    # the page block — cream sheets over the kraft (the kraft edge stays
    # visible all around), with a jittered deckle edge (§7.2 paper rule)
    rect(g,10,8,364,200,PAL['card'])
    rnd=random.Random(26824)
    for dx in range(11,373,3):                   # deckle ticks, top + bottom
        if rnd.random()<0.55: rect(g,dx,8,2,1,PAL['claylt'])
        if rnd.random()<0.55: rect(g,dx+1,207,2,1,PAL['claylt'])
    for dy in range(9,206,3):                    # deckle ticks, both sides
        if rnd.random()<0.55: rect(g,10,dy,1,2,PAL['claylt'])
        if rnd.random()<0.55: rect(g,373,dy,1,2,PAL['claylt'])
    # rougher, warmer page tooth than the journal station (paper on card)
    noise(g,12,10,360,196,PAL['paper'],0.02,26825)
    noise(g,12,10,360,196,PAL['stone'],0.004,26826)  # rare rough flecks
    # the stacked closed sheets peeking below the open field
    rect(g,12,198,360,1,PAL['shadow']); rect(g,14,201,356,1,PAL['stone'])
    rect(g,16,204,352,1,PAL['shadow'])
    for sx in range(18,352,19):                  # sheet-cut notches
        rect(g,sx,199,1,1,PAL['stone']); rect(g,sx+9,202,1,1,PAL['shadow'])
    # the gutter — a dithered valley with the EXPOSED kettle-stitch
    # binding (thread dashes + claylt knots): the stitching you can see
    checker(g,186,8,3,200,PAL['shadow'])
    rect(g,189,8,6,200,PAL['shadow'])
    checker(g,195,8,3,200,PAL['shadow'])
    for sy in range(14,198,12):
        rect(g,191,sy,2,4,PAL['soft'])           # thread stitch
        px(g,192,sy+5,PAL['claylt'])             # kettle knot
    # CONTRAST GATE re-lay: the calendar day-grid zone goes back to
    # clean card, then ONLY the barely-there warm tooth — nothing
    # darker than --paper ever lands inside x28..177 y52..161.
    rect(g,28,52,150,110,PAL['card'])
    noise(g,28,52,150,110,PAL['paper'],0.008,26827)
    # drawn rim + stepped round corners (the station-object idiom)
    rect(g,0,0,384,1,PAL['ink']); rect(g,0,215,384,1,PAL['ink'])
    rect(g,0,0,1,216,PAL['ink']); rect(g,383,0,1,216,PAL['ink'])
    roundcorner(g,4,PAL['ink'])
    outline(g,PAL['ink'])
    write_png(ROOM+'notebook-station.png',g)

def gen_notebook_decor():
    # the three D-12 page marks as ONE horizontal 3-cell sheet —
    # [stamp frame | washi strip | candle mark], 12x12 scene px per
    # cell (grid 36x12 -> 72x24 PNG); app.js paintBlessingPage crops a
    # cell by background-position. José Naranja register: small
    # journal-margin keepsakes, toothed fills, no text, no coral (the
    # candle flame here is --claylt — warm, never the chrome accent).
    g=grid(36,12)
    # cell 0 — the postage-stamp frame (a sepia keepsake border)
    rect(g,1,1,10,10,PAL['deep'])                # frame ring block
    rect(g,2,2,8,8,PAL['card'])                  # stamp face
    for i in range(1,11,2):                      # perforated edge notches
        for (x,y) in ((i,1),(i,10),(1,i),(10,i)):
            g[y][x]=None
    rect(g,3,3,6,1,PAL['shadow'])                # face top shade hairline
    rect(g,3,7,6,2,PAL['wood'])                  # sepia low band (a hill)
    rect(g,4,6,2,1,PAL['wood'])
    px(g,8,4,PAL['clay'])                        # small clay sun
    px(g,4,4,PAL['stone'])                       # one cloud fleck
    # cell 1 — the washi strip, laid diagonally with torn ends
    for c in range(12):
        x=12+c; cy=9-(c*7)//11                   # bottom-left -> top-right
        for dy in range(-2,2):
            if 0<=cy+dy<12: g[cy+dy][x]=PAL['claylt']
    for c in range(0,12,3):                      # tape pattern: card dots
        x=12+c; cy=9-(c*7)//11
        px(g,x,cy,PAL['card']); px(g,x+1,cy-2,PAL['stone'])
    g[11][12]=None; g[7][12]=None                # torn end, lower-left
    g[0][23]=None; g[3][23]=None                 # torn end, upper-right
    px(g,13,10,PAL['stone']); px(g,22,1,PAL['stone'])  # edge shreds
    # cell 2 — the candle mark (the room candle's grammar, flame after
    # the outline pass: light has no ink border; claylt only, no coral)
    cg=grid(10,12)
    px(cg,4,3,PAL['ink'])                        # wick
    rect(cg,2,4,5,5,PAL['card'])                 # wax body
    rect(cg,2,6,5,1,PAL['shadow'])               # drip band
    rect(cg,1,9,8,3,PAL['deep'])                 # holder dish
    rect(cg,1,9,8,1,PAL['wood'])                 # dish lit lip
    outline(cg,PAL['ink'])
    px(cg,4,1,PAL['claylt']); px(cg,4,2,PAL['claylt'])  # warm flame
    for yy in range(12):
        for xx in range(10):
            if cg[yy][xx] is not None: g[yy][24+xx]=cg[yy][xx]
    write_png(ROOM+'notebook-decor.png',g)

# ---- 26.9-04 (D-11/D-16): THE STICKER SHEET -------------------------------
#
# notebook-stickers.png is a SEPARATE FILE and notebook-decor.png above is NOT
# touched. That is deliberate and load-bearing: notebook-decor feeds the
# deterministic seeded auto mark (pickBlessingDecoration over itemId + ms), so
# the same page wears the same mark forever and D-15's reset can restore a page
# exactly. Its byte-stability is the premise the reset design rests on. Growing
# it to 13 cells would re-index every existing page's mark.
#
# ONE horizontal strip: uniform 24 art-px height, VARIABLE per-sticker width,
# nearest-upscaled x2 by write_png, so the PNG is (sum of widths)*2 x 48. The
# widths below are the sheet's only geometry — app.js NB_STICKERS and
# server.py DECOR_SPRITES mirror the NAMES, and tests/test_sprite_geometry.py
# derives the expected PNG width from this roster. A sticker whose art is
# shorter than its cell leaves transparent padding, and that slop becomes
# generous hit area in the tray.
#
# CUT LADDER, TIER C: cutting decoration richness is a roster edit plus a
# regen — delete the last four rows and the sheet, the tables and the gate all
# follow. No geometry rewrite, no CSS change, no store-shape change.
#
# PALETTE: zero green, zero coral (--accent), zero destructive red (--never).
# Green is the one feature wall and plant foliage; coral is the selection
# outline's attention signal and this phase spends none of it.
NB_STICKERS = (
    # Core 6 (Tier B — ships with the editor)
    ('stamp-post', 24), ('washi-stripe', 48), ('corner-photo', 16),
    ('ticket', 32), ('moon', 20), ('candle-mark', 16),
    # Richness 4 (Tier C — first to cut)
    ('stamp-round', 24), ('washi-dot', 48), ('tape-clear', 40), ('thread', 48),
)
NB_STICKER_H = 24


def gen_notebook_stickers():
    W = sum(w for _, w in NB_STICKERS)          # 316 art px with the full roster
    sheet = grid(W, NB_STICKER_H)

    def blit(src, x0):
        """Compose one finished sticker into the strip. Each sticker is drawn
        in its OWN subgrid and outlined THERE — outline() over the whole strip
        would run an ink rim along the seam between neighbouring cells and
        merge them into one blob."""
        for yy in range(len(src)):
            for xx in range(len(src[0])):
                if src[yy][xx] is not None:
                    sheet[yy][x0 + xx] = src[yy][xx]

    def scatter(g, x, y, w, h, c, density, seed):
        """noise() over TRANSPARENT ground. The shipped helper deliberately
        skips None pixels (it is a tooth over an existing surface); tape-clear
        and thread are textures that ARE the sticker, with nothing underneath,
        so they need their own seeded loop. Same determinism law: one fixed
        literal seed per call site, never module-level random.*."""
        rnd = random.Random(seed)
        for j in range(y, y + h):
            for i in range(x, x + w):
                if 0 <= j < len(g) and 0 <= i < len(g[0]) and rnd.random() < density:
                    g[j][i] = c

    x = 0
    for name, w in NB_STICKERS:
        s = grid(w, NB_STICKER_H)

        if name == 'stamp-post':
            # card field + shadow tooth, paper perforation notches, ink rim
            rect(s, 2, 3, 20, 18, PAL['card'])
            noise(s, 2, 3, 20, 18, PAL['shadow'], 0.012, 940211)
            rect(s, 4, 14, 16, 3, PAL['wood'])       # a sepia hill band
            rect(s, 6, 12, 8, 2, PAL['wood'])
            rect(s, 4, 17, 16, 1, PAL['deep'])       # shade under the hill
            rect(s, 15, 6, 3, 3, PAL['clay'])        # a small clay sun
            px(s, 15, 6, None); px(s, 17, 6, None)   # its corners knocked round
            px(s, 15, 8, None); px(s, 17, 8, None)
            px(s, 16, 5, PAL['claylt']); px(s, 16, 9, PAL['claylt'])
            px(s, 14, 7, PAL['claylt']); px(s, 18, 7, PAL['claylt'])
            rect(s, 5, 7, 4, 1, PAL['stone'])        # a cloud, two tiers
            rect(s, 6, 6, 2, 1, PAL['stone'])
            for i in range(3, 21, 3):                # perforation, top + bottom
                px(s, i, 3, PAL['paper']); px(s, i, 20, PAL['paper'])
            for j in range(5, 20, 3):                # perforation, both sides
                px(s, 2, j, PAL['paper']); px(s, 21, j, PAL['paper'])
            outline(s, PAL['ink'])

        elif name == 'washi-stripe':
            # clay base + claylt stripes, jittered deckle, torn ends. Paper-like:
            # a deckle edge, NEVER stepped corners + rim (SPRITES 7.2).
            rect(s, 0, 8, 48, 8, PAL['clay'])
            for i in range(2, 48, 8):                # the stripes — a real
                rect(s, i, 8, 3, 8, PAL['claylt'])   # alternating rhythm, not a
            noise(s, 0, 8, 48, 8, PAL['clay'], 0.05, 940212)  # 50% duty cycle
            rect(s, 0, 8, 48, 1, PAL['claylt'])      # lit top lip
            rect(s, 0, 15, 48, 1, PAL['soft'])       # shade band at the bottom
            rnd = random.Random(940213)
            for i in range(48):                      # deckle: a SPARSE nibble,
                if rnd.random() < 0.22:              # not 50% of every column
                    s[8][i] = None
                if rnd.random() < 0.22:
                    s[15][i] = None
            for i in range(3):                       # torn ends, both sides
                for j in range(8, 16):
                    if rnd.random() < 0.4:
                        s[j][i] = None
                        s[j][47 - i] = None

        elif name == 'corner-photo':
            # a photo corner mount: deep + wood, ink rim, checker ONLY on the
            # underside shadow (7.2: dither lives at shading boundaries).
            for j in range(4, 16):                   # the triangular fold
                rect(s, 2, j, min(12, (j - 3) + 1), 1, PAL['deep'])
            rect(s, 2, 4, 3, 1, PAL['wood'])         # lit top lip
            rect(s, 2, 5, 2, 1, PAL['wood'])
            noise(s, 2, 4, 12, 12, PAL['wood'], 0.06, 940214)
            checker(s, 3, 15, 10, 1, PAL['soft'])    # the underside shadow
            outline(s, PAL['ink'])

        elif name == 'ticket':
            # paper + shadow tooth, one stone perforation run, jittered tear
            rect(s, 1, 6, 30, 12, PAL['paper'])
            noise(s, 1, 6, 30, 12, PAL['shadow'], 0.014, 940215)
            rect(s, 1, 6, 30, 1, PAL['card'])        # lit top lip
            rect(s, 1, 17, 30, 1, PAL['shadow'])     # shade band at the bottom
            for j in range(7, 17, 2):                # the perforation run
                px(s, 10, j, PAL['stone'])
            rect(s, 14, 9, 12, 1, PAL['stone'])      # two quiet rule lines
            rect(s, 14, 13, 9, 1, PAL['stone'])
            rnd = random.Random(940216)
            for j in range(6, 18):                   # deckle tear, right end
                for k in range(rnd.randint(0, 2)):
                    s[j][30 - k] = None
            outline(s, PAL['ink'])

        elif name == 'moon':
            # stone crescent + card lip, soft shade band at the bottom
            cx, cy, r = 9, 12, 8
            for j in range(NB_STICKER_H):
                for i in range(w):
                    d = (i - cx) ** 2 + (j - cy) ** 2
                    cut = (i - (cx + 5)) ** 2 + (j - (cy - 2)) ** 2
                    if d <= r * r and cut > (r - 1) ** 2:
                        s[j][i] = PAL['stone']
            noise(s, 0, 0, w, NB_STICKER_H, PAL['soft'], 0.08, 940217)
            for j in range(NB_STICKER_H):            # the lit outer lip
                for i in range(w):
                    if s[j][i] is not None and (i > 0 and s[j][i - 1] is None):
                        s[j][i] = PAL['card']
            for j in range(16, NB_STICKER_H):        # shade band at the bottom
                for i in range(w):
                    if s[j][i] is not None and s[j][i] != PAL['card']:
                        s[j][i] = PAL['soft']
            outline(s, PAL['ink'])

        elif name == 'candle-mark':
            # wood body + card flame core + claylt warm edge — the room's own
            # candle motif echoed. Distinct from notebook-decor's candle: this
            # one is a tall taper on a saucer, that one is a stub in a dish.
            px(s, 7, 4, PAL['ink'])                  # wick
            rect(s, 5, 5, 6, 12, PAL['wood'])        # the taper body
            rect(s, 5, 5, 2, 12, PAL['deep'])        # shade down the left face
            noise(s, 5, 5, 6, 12, PAL['deep'], 0.10, 940218)
            rect(s, 5, 9, 6, 1, PAL['card'])         # a wax drip band
            rect(s, 3, 17, 10, 2, PAL['stone'])      # the saucer
            rect(s, 3, 17, 10, 1, PAL['card'])       # saucer lit lip
            checker(s, 3, 19, 10, 1, PAL['soft'])    # dither under the saucer
            outline(s, PAL['ink'])
            px(s, 7, 2, PAL['claylt'])               # flame AFTER the rim —
            px(s, 7, 3, PAL['card'])                 # light has no ink border
            px(s, 6, 3, PAL['claylt']); px(s, 8, 3, PAL['claylt'])

        elif name == 'stamp-round':
            # soft ring, paper centre, heavy noise for a rubber-stamp break-up
            cx, cy = 11, 12
            for j in range(NB_STICKER_H):
                for i in range(w):
                    d = (i - cx) ** 2 + (j - cy) ** 2
                    if d <= 100:
                        s[j][i] = PAL['soft'] if d > 49 else PAL['paper']
            noise(s, 0, 0, w, NB_STICKER_H, PAL['shadow'], 0.10, 940219)
            rect(s, 6, 11, 10, 1, PAL['soft'])       # two struck bars, no glyphs
            rect(s, 7, 13, 8, 1, PAL['soft'])
            # The rubber-stamp ink break-up, scoped to the RING only: applied
            # over the whole cell it ate the paper centre too and the sticker
            # read as a splat rather than a stamp.
            rnd = random.Random(940220)
            for j in range(NB_STICKER_H):
                for i in range(w):
                    d = (i - cx) ** 2 + (j - cy) ** 2
                    if s[j][i] is not None and d > 49 and rnd.random() < 0.10:
                        s[j][i] = None

        elif name == 'washi-dot':
            # claylt base + clay dots, torn ends — the stripe's sibling
            rect(s, 0, 8, 48, 8, PAL['claylt'])
            for i in range(2, 46, 8):                # the dots, two staggered
                rect(s, i, 10, 3, 2, PAL['clay'])    # rows, spaced far enough
                rect(s, i + 4, 13, 3, 2, PAL['clay'])  # apart to read as dots
            noise(s, 0, 8, 48, 8, PAL['clay'], 0.04, 940221)
            rect(s, 0, 8, 48, 1, PAL['card'])        # lit top lip
            rect(s, 0, 15, 48, 1, PAL['clay'])       # shade band at the bottom
            rnd = random.Random(940222)
            for i in range(48):                      # deckle, both long edges
                if rnd.random() < 0.22:
                    s[8][i] = None
                if rnd.random() < 0.22:
                    s[15][i] = None
            for i in range(3):                       # torn ends
                for j in range(8, 16):
                    if rnd.random() < 0.4:
                        s[j][i] = None
                        s[j][47 - i] = None

        elif name == 'tape-clear':
            # shadow at 0.16 over TRANSPARENT ground — reads as translucent
            # tape without an alpha channel value other than 0 or 255. The
            # sparse fill IS the material; there is no base to lay tooth on.
            # DENSITY RAISED FROM THE UI-SPEC'S 0.16 to 0.24, and the two long
            # edges drawn as SOLID stone lines with a jittered nibble rather
            # than a 0.55 scatter. At 0.16 with scattered edges the cell landed
            # at 7.6% coverage and was invisible in the tray at card size — a
            # sticker she cannot see is one she cannot pick. The material is
            # still shadow-over-transparent (translucent tape without an alpha
            # value other than 0 or 255); only its legibility changed.
            scatter(s, 1, 8, 38, 9, PAL['shadow'], 0.24, 940223)
            rect(s, 1, 8, 38, 1, PAL['stone'])       # the tape's two edges
            rect(s, 1, 16, 38, 1, PAL['stone'])
            rnd = random.Random(940226)
            for i in range(1, 39):                   # nibble the edges so they
                if rnd.random() < 0.3:               # are not ruler-straight
                    s[8][i] = None
                if rnd.random() < 0.3:
                    s[16][i] = None
            for i in range(1, 5):                    # torn ends: thin them out
                for j in range(8, 17):
                    if rnd.random() < 0.55:
                        s[j][i] = None
                        s[j][39 - i] = None

        elif name == 'thread':
            # a running stitch: soft dashes of VARIED length (7.2 — evenly
            # spaced identical dashes are the vector tell). grain() skips
            # transparent pixels, so the stitch rides its own seeded loop.
            rnd = random.Random(940227)
            i = 0
            y = 12
            while i < 48:
                L = rnd.randint(3, 6)
                for k in range(min(L, 48 - i)):
                    s[y][i + k] = PAL['soft']
                    s[y + 1][i + k] = PAL['soft']    # a 2px thread, always —
                    if rnd.random() < 0.4:           # a 1px wander read as dust
                        s[y + 2][i + k] = PAL['stone']
                i += L + rnd.randint(2, 3)
                y = max(10, min(14, y + rnd.randint(-1, 1)))  # a hand's wander

        blit(s, x)
        x += w

    write_png(ROOM + 'notebook-stickers.png', sheet)


# ---- 26.9995-04: THE TEN DESK SPRITES, ported faithfully from the design's
#      newassets.py (docs/DESK-REDESIGN-HANDOFF.md §1; design source READ-ONLY
#      at design-canvas/study-room-desk/). Same canvas sizes, same shapes, same
#      coordinates, same colours — hex string constants translated into PAL
#      keys (GLIGHT->leaflit, GDEEP->greendark, BLUE->ceramic, BLUEL->ceramiclt,
#      #4c6675->ceramicdk, BRASS->brass, #c9a75c->brasslt, GLASS->glass,
#      SAGE->sage; the room's own keys for the rest). All ten land as CODEGEN —
#      SPRITES.md 7.3's overwrite trap means a copied PNG dies on the next test
#      run; these are drawn here so they regenerate byte-stable forever.
#      newassets.py uses NO randomness: every sprite below is fully
#      deterministic from literals, so 7.4's per-site seed law has nothing to
#      convert (stated so a reader need not wonder). Each ends in the kit's
#      silhouette() ink pass — #2c2823, ruled 2026-08-06 and again 2026-08-07.
#      Three follow her recorded Plan 03 rulings of 2026-08-25 verbatim:
#      the cactus and bud-vase flowers are CORAL ("Red flowers"), and the
#      pen cup's third pencil is PAL['green'] ("Green pencil").

def gen_plant_snake():
    # tall blades in a glazed ceramic pot (20x46)
    g=grid(20,46)
    for (x,ht,wd,c) in ((6,30,4,'greendark'),(9,36,5,'green'),(13,28,4,'leaflit'),
                        (11,22,3,'green'),(7,18,3,'leaflit')):
        blade(g,x,35,ht,wd,PAL[c])
    for y in range(8,34,3): px(g,9,y,PAL['leaflit'])
    taper(g,4,35,12,9,10,PAL['ceramic'])
    rect(g,4,35,12,2,PAL['ceramiclt'])
    rect(g,5,42,10,2,PAL['soft'])
    silhouette(g); write_png(ROOM+'plant-snake.png',g)

def gen_plant_pothos():
    # a shelf pot with vines hanging straight down (26x36)
    g=grid(26,36)
    taper(g,8,7,10,8,8,PAL['clay']); rect(g,8,7,10,2,PAL['claylt'])
    for (cx,cy,c) in ((8,5,'greendark'),(13,3,'green'),(18,5,'leaflit'),
                      (11,5,'green'),(15,4,'greendark')):
        disc(g,cx,cy,3,2,PAL[c])
    for (vx,top,length,side) in ((9,13,19,-1),(13,14,21,1),(17,13,16,1)):
        for i in range(length):
            y=top+i
            px(g,vx,y,PAL['soft'])
            if i%2==1:
                d=side if (i//2)%2==0 else -side
                c=('green','leaflit','greendark')[(i//2)%3]
                disc(g,vx+d*3,y,3,2,PAL[c])
                px(g,vx+d,y,PAL['soft']); px(g,vx+d*2,y,PAL['soft'])
    silhouette(g); write_png(ROOM+'plant-pothos.png',g)

def gen_plant_succulent():
    # a succulent in a low stone bowl (20x16)
    g=grid(20,16)
    taper(g,3,10,14,5,10,PAL['stone']); rect(g,3,10,14,2,PAL['card'])
    for (dx,dy,ht,wd,c) in ((0,-1,6,3,'sage'),(-3,0,5,3,'leaflit'),(3,0,5,3,'leaflit'),
                            (-5,1,4,2,'sage'),(5,1,4,2,'sage'),
                            (-1,1,3,2,'green'),(2,1,3,2,'green')):
        blade(g,10+dx,10+dy,ht,wd,PAL[c])
    disc(g,10,7,1,1,PAL['card'])
    silhouette(g); write_png(ROOM+'plant-succulent.png',g)

def gen_plant_cactus():
    # cactus, flowering (20x30). The flower is CORAL as designed — her ruling,
    # verbatim selection label, 2026-08-25: "Red flowers" (SPRITES.md §2).
    g=grid(20,30)
    taper(g,6,21,9,8,8,PAL['clay']); rect(g,6,21,9,2,PAL['claylt'])
    disc(g,10,14,4,9,PAL['green'])                             # the body
    rect(g,9,6,3,10,PAL['leaflit'])
    rect(g,4,13,3,6,PAL['green']); rect(g,4,11,3,3,PAL['green'])  # left arm, bending up
    rect(g,4,11,1,7,PAL['leaflit'])
    rect(g,14,16,3,5,PAL['greendark']); rect(g,14,14,3,3,PAL['greendark'])  # right arm
    for y in range(8,21,3):
        px(g,7,y,PAL['greendark']); px(g,13,y+1,PAL['greendark'])
    disc(g,10,4,2,2,PAL['accent']); px(g,10,3,PAL['claylt'])   # the red flower
    silhouette(g); write_png(ROOM+'plant-cactus.png',g)

def gen_plant_cutting():
    # a cutting rooting in a glass jar (14x26)
    g=grid(14,26)
    rect(g,3,10,8,14,PAL['glass'])
    rect(g,3,15,8,9,PAL['ceramiclt'])          # the water line
    rect(g,3,10,8,1,PAL['card'])
    px(g,6,12,PAL['soft']); px(g,6,13,PAL['soft'])
    for y in range(14,22): px(g,6,y,PAL['greendark'])
    rect(g,4,9,6,1,PAL['stone'])
    for (lx,ly,c) in ((3,7,'green'),(9,5,'leaflit'),(4,3,'green'),(8,1,'greendark')):
        disc(g,lx,ly,2,2,PAL[c]); px(g,6,ly+1,PAL['soft'])
    for y in range(2,10): px(g,6,y,PAL['soft'])
    silhouette(g); write_png(ROOM+'plant-cutting.png',g)

def gen_plant_budvase():
    # one stem in a ceramic bud vase (12x28). The flower is CORAL as designed —
    # her ruling, verbatim, 2026-08-25: "Red flowers" (SPRITES.md §2).
    g=grid(12,28)
    taper(g,3,16,6,10,5,PAL['ceramic']); rect(g,3,16,6,2,PAL['ceramiclt'])
    rect(g,4,12,4,5,PAL['ceramic'])
    for y in range(5,17): px(g,6,y,PAL['greendark'])
    disc(g,4,10,1,1,PAL['green']); disc(g,8,8,1,1,PAL['leaflit'])
    disc(g,6,3,3,3,PAL['accent'])                              # the red flower
    disc(g,6,2,2,1,PAL['claylt']); px(g,6,4,PAL['clay'])
    silhouette(g); write_png(ROOM+'plant-budvase.png',g)

def gen_lamp_desk():
    # the desk lamp — brass shade on a wood base (24x32). Drawn, per the
    # handoff §2: whether it is ever PLACED is a fiction decision that stays
    # hers; landing the sprite decides nothing about the scene.
    g=grid(24,32)
    rect(g,4,28,14,3,PAL['wood']); rect(g,4,28,14,1,PAL['card'])
    rect(g,5,31,12,1,PAL['deep'])                              # base
    for y in range(10,29): px(g,10,y,PAL['soft']); px(g,11,y,PAL['ink'])  # stem
    rect(g,10,9,8,2,PAL['soft']); px(g,17,10,PAL['ink'])       # the arm out
    taper(g,12,12,10,7,16,PAL['brass'])                        # the shade, hanging
    rect(g,13,12,8,2,PAL['brasslt'])
    rect(g,12,18,16,1,PAL['card'])
    rect(g,14,19,10,1,PAL['wood'])
    silhouette(g); write_png(ROOM+'lamp-desk.png',g)

def gen_mug():
    # a glazed ceramic mug (14x13)
    g=grid(14,13)
    rect(g,2,2,9,10,PAL['ceramic']); rect(g,2,2,9,2,PAL['ceramiclt'])
    rect(g,2,2,9,1,PAL['card'])
    rect(g,3,4,2,7,PAL['ceramiclt'])
    rect(g,11,4,2,2,PAL['ceramic']); rect(g,11,8,2,2,PAL['ceramic'])
    rect(g,12,5,1,4,PAL['ceramiclt'])
    silhouette(g); write_png(ROOM+'mug.png',g)

def gen_pen_cup():
    # a cup of pencils (14x22). The third pencil is PAL['green'] as designed —
    # her ruling, verbatim selection label, 2026-08-25: "Green pencil"
    # (SPRITES.md §2): the first non-foliage carrier of the one living green.
    g=grid(14,22)
    for (x,ht,c) in ((4,9,'claylt'),(7,12,'ceramic'),(10,7,'green')):
        rect(g,x,22-ht-8,2,ht,PAL[c])
        px(g,x,22-ht-8,PAL['wood']); px(g,x+1,22-ht-8,PAL['wood'])
        px(g,x,22-ht-9,PAL['ink'])
    taper(g,2,14,10,7,8,PAL['stone']); rect(g,2,14,10,2,PAL['card'])
    silhouette(g); write_png(ROOM+'pen-cup.png',g)

def gen_watering_can():
    # a ceramic watering can (24x17)
    g=grid(24,17)
    rect(g,4,5,12,10,PAL['ceramic']); rect(g,4,5,12,2,PAL['ceramiclt'])
    rect(g,4,13,12,2,PAL['ceramicdk'])
    rect(g,16,7,5,2,PAL['ceramiclt']); rect(g,19,4,2,4,PAL['ceramiclt'])
    rect(g,18,3,4,1,PAL['stone'])
    rect(g,6,2,8,1,PAL['soft'])
    px(g,5,3,PAL['soft']); px(g,14,3,PAL['soft'])
    px(g,5,4,PAL['soft']); px(g,14,4,PAL['soft'])
    silhouette(g); write_png(ROOM+'watering-can.png',g)

# ---- 26.999 (her design sitting + approved canvas "The Desk Surfaces",
#      2026-08-25): the desk-surface pair — the sticky note that dresses
#      the desk's gift-note card, and the card box that IS the librarian's
#      memory of you, drawn to her reference (a wooden index-card box, lid
#      open behind, tabbed dividers, a small brass clasp). Her palette
#      ruling covers the rose (see PAL['rose']); every random call seeded
#      (§7.4); silhouette ink like the ten (§7.2 object register). --------

def gen_desk_sticky():
    # two overlapping sticky notes (13x8 -> 26x16 PNG), after her pixel
    # bulletin-board reference (26.999-DESIGN-SITTING-2026-08-25.md): the
    # front one the room's own blonde wood-yellow, the back one the ruled
    # rose. Two line HINTS only — never readable words (law 4's spirit:
    # the room draws paper, never fakes her writing).
    g=grid(13,8)
    rect(g,5,0,8,6,PAL['rose'])                  # the back sticky
    rect(g,5,0,8,1,PAL['card'])                  # its glue strip
    rect(g,0,1,8,7,PAL['wood'])                  # the front sticky
    rect(g,0,1,8,1,PAL['card'])                  # glue strip
    px(g,1,4,PAL['soft']); px(g,2,4,PAL['soft']); px(g,3,4,PAL['soft'])
    px(g,4,4,PAL['soft']); px(g,5,4,PAL['soft'])
    px(g,1,6,PAL['soft']); px(g,2,6,PAL['soft']); px(g,3,6,PAL['soft'])
    silhouette(g); write_png(ROOM+'desk-sticky.png',g)

def gen_cardbox():
    # the librarian's memory of you (15x14 -> 30x28 PNG). Open lid standing
    # behind (wood rim, deeper inner face), one solid card mass in the
    # mouth — a gap between cards would go transparent and the silhouette
    # ink would flood the opening — with staggered tabbed dividers over it,
    # the box front in furniture wood with grain, a wood-dark foot, and the
    # brass clasp over the rim, front centre.
    g=grid(15,14)
    rect(g,1,0,13,5,PAL['wood'])                 # the open lid
    rect(g,2,1,11,4,PAL['deep'])                 # its inside face
    noise(g,2,1,11,4,PAL['wood'],0.08,26991)
    rect(g,2,5,11,3,PAL['card'])                 # the card mass in the mouth
    rect(g,2,5,11,1,PAL['shadow'])               # shaded card-edge row
    for i,x in enumerate((2,4,6,8,10,12)):       # tabbed dividers, staggered
        c=PAL[('rose','claylt','card','rose','claylt','rose')[i]]
        rect(g,x,4+(i%2),1,2-(i%2),c)            # the tab
        rect(g,x,6,1,2,c)                        # its divider face
    rect(g,0,8,15,6,PAL['wood'])                 # the box front
    noise(g,0,8,15,6,PAL['deep'],0.06,26992)
    rnd=random.Random(26993)
    for _ in range(2):                           # long varied grain (§7.2)
        gy=rnd.randrange(9,12); gx=rnd.randrange(1,5)
        for i in range(rnd.randrange(4,8)): px(g,gx+i,gy,PAL['deep'])
    rect(g,0,8,15,1,PAL['deep'])                 # the rim line
    rect(g,0,12,15,2,PAL['wooddark'])            # foot shade
    rect(g,7,7,2,2,PAL['brass'])                 # the clasp, over the rim
    px(g,7,7,PAL['brasslt']); px(g,8,7,PAL['brasslt'])
    silhouette(g); write_png(ROOM+'cardbox.png',g)

def gen_paper_stack():
    # 26.999 (her ruling, 2026-08-25, from the built room): the guided first
    # pass's door becomes A SMALL STACK OF PAPERS — pressed, not read. Her
    # wall sentence is removed from the render (the aria name keeps her
    # chosen words, one-source); this pile is the whole visible door.
    # 24x14 -> 48x28 PNG: offset sheets in the plate pile's own register
    # (card/paper layers, shadow split lines, an ink top edge). No counts,
    # no words (law 3).
    g=grid(24,14)
    rect(g,2,9,19,4,PAL['card']);  rect(g,2,12,19,1,PAL['shadow'])
    rect(g,4,6,18,3,PAL['paper']); rect(g,4,8,18,1,PAL['shadow'])
    rect(g,3,3,18,3,PAL['card']);  rect(g,3,5,18,1,PAL['shadow'])
    rect(g,3,3,18,1,PAL['paper'])                # top-sheet highlight lip
    rnd=random.Random(26994)
    for _ in range(3):                           # sheet-edge nicks (§7.2)
        px(g,rnd.randrange(4,20),rnd.randrange(4,11),PAL['shadow'])
    silhouette(g); write_png(ROOM+'paper-stack.png',g)

# ---- 26.999 (night, her ruling): THE QUIET MARKS — three variant sprites,
#      one per daily-activity object, worn ONLY while something new truly
#      waits and swapped back once she has looked. Her selection from the
#      offered set (AskUserQuestion, 2026-08-25 night): the album, the
#      blessing journal, the daily blessing stack — the candle deliberately
#      NOT chosen. ⛔ No red, no numbers, no words (her gentler-mark ruling
#      over the notification-dot ask; laws 1/3 hold: art states, never
#      badges). Each variant keeps its base's exact canvas and register so
#      no seat, roster or geometry pin moves — only the drawing differs.

def gen_album_open():
    # the album with a photograph slipping out of the top — photos came
    # back that she has not looked through. Base drawing verbatim, plus
    # the peeking photo: a card tab above the cover's top edge with a
    # shadow seam where it enters the pages.
    g=grid(20,14)
    rect(g,1,1,18,12,PAL['soft']); rect(g,1,1,3,12,PAL['ink']); rect(g,17,2,2,10,PAL['card'])
    rect(g,7,4,8,6,PAL['card']); rect(g,8,5,6,3,PAL['shadow'])
    rect(g,8,0,5,2,PAL['card'])                  # the photo's corner, peeking
    px(g,8,1,PAL['shadow'])                      # a soft lower-left seam
    outline(g,PAL['ink']); write_png(ROOM+'album-open.png',g)

def gen_notebook_marked():
    # the 手帐 with a rose bookmark showing in its page block — new pages
    # landed since she last opened it. Base drawing verbatim (the smooth
    # spine, the stitch, the label plate), plus the rose tab between the
    # fore-edge's sheet split lines. Dusty rose is chartered (§8.2, hers).
    g=grid(14,11)
    rect(g,0,0,12,11,PAL['clay'])
    rect(g,2,0,10,1,PAL['claylt'])
    noise(g,2,1,10,9,PAL['claylt'],0.13,26810)
    rect(g,0,0,2,11,PAL['clay'])
    rect(g,1,0,1,11,PAL['claylt'])
    for y in (2,4,6,8): px(g,0,y,PAL['claylt'])
    for y in (3,5,7): px(g,3,y,PAL['claylt'])
    rect(g,5,3,5,5,PAL['card'])
    rect(g,5,3,5,1,PAL['ink']); rect(g,5,7,5,1,PAL['ink'])
    rect(g,5,3,1,5,PAL['ink']); rect(g,9,3,1,5,PAL['ink'])
    px(g,6,4,PAL['paper'])
    rect(g,6,5,3,1,PAL['stone'])
    px(g,7,6,PAL['clay'])
    rect(g,10,0,1,11,PAL['soft'])
    rect(g,12,1,2,9,PAL['card'])
    rect(g,12,3,2,1,PAL['shadow'])
    rect(g,12,6,2,1,PAL['shadow'])
    rect(g,12,4,2,2,PAL['rose'])                 # the rose bookmark tab
    g[0][0]=None; g[10][0]=None
    outline(g,PAL['ink'])
    write_png(ROOM+'notebook-marked.png',g)

def gen_paper_stack_waiting():
    # the stack with its top sheet sitting askew — things wait for a first
    # look; squared away (the plain stack, then F-8's dim) when nothing
    # does. Lower sheets verbatim; the top sheet redrawn offset.
    g=grid(24,14)
    rect(g,2,9,19,4,PAL['card']);  rect(g,2,12,19,1,PAL['shadow'])
    rect(g,4,6,18,3,PAL['paper']); rect(g,4,8,18,1,PAL['shadow'])
    rect(g,5,2,18,3,PAL['card']);  rect(g,5,4,18,1,PAL['shadow'])
    rect(g,5,2,18,1,PAL['paper'])                # the askew sheet's lip
    rnd=random.Random(26994)
    for _ in range(3):                           # sheet-edge nicks (§7.2)
        px(g,rnd.randrange(4,20),rnd.randrange(4,11),PAL['shadow'])
    silhouette(g); write_png(ROOM+'paper-stack-waiting.png',g)


for f in (gen_bg,gen_bookshelf,gen_desk,gen_chair,gen_album,gen_journal,gen_candle,gen_plant,gen_window,
          gen_bench,gen_window_dusk,gen_window_night,
          gen_decor_rug,gen_decor_books,gen_decor_art,gen_decor_plant_b,gen_candle_anim,
          gen_reflection_books,
          gen_spread_frame_book,gen_spread_frame_album,gen_spread_frame_paper,
          gen_desk_station,gen_desk_station_night,gen_shelf_station,gen_album_page,
          gen_notebook,gen_notebook_station,gen_notebook_decor,
          gen_notebook_stickers,
          gen_plant_snake,gen_plant_pothos,gen_plant_succulent,gen_plant_cactus,
          gen_plant_cutting,gen_plant_budvase,gen_lamp_desk,gen_mug,
          gen_pen_cup,gen_watering_can,gen_desk_sticky,gen_cardbox,
          gen_paper_stack,
          gen_album_open,gen_notebook_marked,gen_paper_stack_waiting): f()
print('generated: real-scale sprites (24px/ft) + office chair, SFMOMA window + split bench, cast shadows, catalog decor v1, spread-frame skins, desk-station bg + its night plate (26.9995-07), shelf-station bg, album page, blessings-notebook set (object + station + decor marks + sticker sheet), the ten desk sprites (26.9995-04), the desk-surface pair (26.999), the three quiet wait marks (26.999 night)')
