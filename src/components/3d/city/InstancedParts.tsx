import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree, RootState } from "@react-three/fiber";
import * as THREE from "three";
import { IDLE_KIND, Part, PartIdle, SURFACES, Shape, getShapeGeometry, hdLo, walks } from "./parts";
import { registerGlowMaterial } from "@/components/3d/skyState";
import { FIGHT_SLOTS, FIGHT_UNIFORM, FIGHT_VEC4S, writeFightUniform } from "@/components/3d/world/npcStrikes";

/*
 * Idle animation on the GPU: parts that carry `idle` breathe, float or bob around their model's ground
 * point in the vertex shader (one time uniform per batch), so living models cost no extra draw calls
 * and no per-frame CPU work. A part's own cycle runs first, then its model's (`model`), so a fluttering
 * sail still rocks with its hull. Shadows keep the rest pose (the motion is a few percent).
 */
const IDLE_FUNCTION = `
// Turn about the vertical axis the way a Builder turns its frame (local +z forward → world (sin a, cos a))
// A creature in a live battle turns to face its target (set per vertex by fightFace; 0 for everything else)
float gFace = 0.0;
vec2 gFaceDir = vec2(0.0, 1.0);
vec2 turnY(vec2 v, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * v.x + s * v.y, -s * v.x + c * v.y);
}

float iHash(float n) {
  return fract(sin(n * 127.1 + 311.7) * 43758.5453);
}

// A walker's seeded offsets: where it starts in its cycle and how its path wobbles
float walkSeed(float tempo) {
  return fract(tempo * 91.7);
}

// Lean forward (+, the top toward local +z) and roll (+, the top toward local +x) about the point rel is taken from
vec3 leanRoll(vec3 rel, float pitch, float roll) {
  float cp = cos(pitch);
  float sp = sin(pitch);
  float z = rel.z;
  rel.z = cp * z + sp * rel.y;
  rel.y = cp * rel.y - sp * z;
  float cr = cos(roll);
  float sr = sin(roll);
  float x = rel.x;
  rel.x = cr * x + sr * rel.y;
  rel.y = cr * rel.y - sr * x;
  return rel;
}

// A walker's progress round its loop in quarter turns: it walks one (3.9 units of its own time), then stops for 3–5 s
// (seeded per creature) to look round. Its body and its parts work it out alike from its tempo, so legs step exactly
// while it moves. w: x moving, y speed (0 → 1 → 0), z speeding up (+) or braking (-), w time into the pause (-1 walking)
const float WALK_T = 3.9;
float walkProgress(float t, float tempo, out vec4 w, out float cycle) {
  float pause = mix(3.0, 5.0, fract(tempo * 53.17)) * tempo;
  float period = WALK_T + pause;
  float u = t / period + walkSeed(tempo);
  cycle = floor(u);
  float a = fract(u) * period;
  float x = clamp(a / WALK_T, 0.0, 1.0);
  float moving = smoothstep(0.0, 0.5, a) * (1.0 - smoothstep(WALK_T - 0.65, WALK_T, a));
  // Pushing off it leans in only as it gets going (no jump from the pause's pose)
  float push = (1.0 - 2.0 * x) * (x < 0.5 ? smoothstep(0.0, 0.12, x) : 1.0);
  w = vec4(moving, 4.0 * x * (1.0 - x), a < WALK_T ? push : -1.0, a > WALK_T ? a - WALK_T : -1.0);
  return cycle + x * x * (3.0 - 2.0 * x);
}

// Wing position over one beat: +1 raised, -1 swept down. The downstroke (the power stroke) takes 35% of the beat
float wingPos(float u) {
  float f = fract(u / 6.2831853);
  float s = f < 0.35 ? f / 0.35 : 1.0 - (f - 0.35) / 0.65;
  return 1.0 - 2.0 * s * s * (3.0 - 2.0 * s);
}

// A flyer now and then holds its wings out and glides
float glideOf(float t, float tempo) {
  return smoothstep(0.55, 0.85, sin(t * 0.45 + walkSeed(tempo) * 17.0));
}

// Where a walker's body is in its stride, worked out alike by the body and every part riding it (head, tail, torso)
struct Pose {
  float moving;
  float q;      // progress round the loop in quarter turns
  float step;   // stride phase
  float lift;   // body rise, 0–1 (× the loop radius in walkMove)
  float pitch;  // lean into the walk
  float roll;   // over the supporting leg; a flyer's bank
  float twist;  // the hips turning with the stride
  float turn;   // heading round the loop
  float look;   // where the head glances (pauses)
  float body;   // the body's share of looking round
  float nod;    // the head dipping (sniffing)
  float tilt;   // the head rolling (shaking, scratching)
};

// biped: a two-legged walker (1) carries itself upright and plays a person's events; a beast (0) shakes like a dog
Pose walkPose(float kind, float tempo, float t, float biped) {
  Pose p;
  float seed = walkSeed(tempo);
  float dir = fract(tempo * 37.3) < 0.5 ? -1.0 : 1.0;
  p.moving = 1.0; p.q = 0.0; p.step = 0.0; p.lift = 0.0; p.pitch = 0.0; p.roll = 0.0; p.twist = 0.0; p.turn = 0.0;
  p.look = 0.0; p.body = 0.0; p.nod = 0.0; p.tilt = 0.0;
  if (kind > 15.5) {
    // Hover: its drift and turn live in walkMove; parts only feel its sway and turn
    p.roll = 0.08 * sin(t * 0.7 + seed * 11.0);
    p.body = 0.6 * sin(t * 0.31 + seed * 9.0) + 0.25 * sin(t * 0.83 + seed * 3.0);
    // Its head looks the way it turns
    p.look = p.body;
    return p;
  }
  vec4 w = vec4(1.0, 1.0, 0.0, -1.0);
  float cycle = 0.0;
  if (kind > 14.5) {
    // Fly: surges and eases round the loop, climbs and dives (nose up as it climbs), and banks into the turn
    p.q = t * 0.16 + seed + 0.12 * sin(t * 0.6 + seed * 6.283);
    float swing = sin(p.q * 2.6 + seed * 13.0);
    p.roll = -dir * (0.3 + 0.16 * swing);
    p.lift = 0.35 * sin(p.q * 1.9 + seed * 7.0) + 0.12 * sin(t * 1.7);
    p.pitch = -0.22 * cos(p.q * 1.9 + seed * 7.0);
  } else {
    p.q = walkProgress(t, tempo, w, cycle);
    p.moving = w.x;
  }
  p.step = p.q * 12.566;
  p.turn = dir * p.q * 1.5707963;
  if (kind > 12.5) {
    // Hop and slither: standing still it looks round
    if (kind < 14.5) p.body = 0.45 * sin(t * 0.9 + tempo * 17.0) * (1.0 - p.moving);
    p.look = p.body;
    return p;
  }
  float m = p.moving;
  // Two dips a stride: lowest as a foot lands (legs apart), highest as they pass
  p.lift = (0.5 + 0.5 * cos(2.0 * p.step)) * m * (0.6 + 0.4 * w.y);
  p.roll = mix(0.05, 0.015, biped) * sin(p.step) * m;
  p.twist = 0.08 * sin(p.step) * m;
  // Leans into the walk as it picks up speed and rocks back as it brakes…
  p.pitch = w.w < 0.0 ? 0.06 * w.y + 0.05 * w.z : 0.0;
  if (w.w >= 0.0) {
    // …then settles with a little sway when it stops, shifting its weight now and then while it stands
    float s = w.w / tempo;
    float pause = mix(3.0, 5.0, fract(tempo * 53.17));
    p.pitch = -0.05 * exp(-s * 2.5) * cos(s * 6.0);
    p.roll += 0.025 * sin(s * 0.9 + seed * 5.0) * smoothstep(0.0, 0.6, s);
    // Glances round in snaps, a new point every second or so
    float slot = 0.9 + 0.5 * iHash(cycle + seed * 13.0);
    float g = floor(s / slot);
    float target = (iHash(cycle * 7.1 + g * 3.3 + seed * 11.0) - 0.5) * 1.6;
    float before = g < 0.5 ? 0.0 : (iHash(cycle * 7.1 + (g - 1.0) * 3.3 + seed * 11.0) - 0.5) * 1.6;
    float fade = smoothstep(0.0, 0.2, s) * (1.0 - smoothstep(pause - 0.7, pause - 0.1, s));
    p.look = mix(before, target, smoothstep(0.0, 0.18, fract(s / slot))) * fade;
    // Once a pause, an event of its own: 0 looks round, 1 sniffs (a person looks down), 2 shakes itself (a person
    // stretches, leaning back and looking up), 3 shifts and scratches (a person shifts its weight, head tilted)
    float kindOf = floor(iHash(cycle * 3.7 + seed * 19.0) * 4.0);
    float e = s - (0.4 + 0.8 * iHash(cycle * 5.3 + seed));
    float ev = smoothstep(0.0, 0.25, e) * (1.0 - smoothstep(1.2, 1.6, e)) * fade;
    if (kindOf < 0.5) {
      p.look += ev * 0.9 * sin(e * 2.4);
    } else if (kindOf < 1.5) {
      p.nod = ev * (biped > 0.5 ? 0.25 : 0.3 + 0.07 * sin(e * 18.0));
      p.pitch += 0.05 * ev;
    } else if (kindOf < 2.5) {
      if (biped > 0.5) {
        p.pitch -= 0.05 * ev;
        p.nod = -0.15 * ev;
      } else {
        p.roll += ev * 0.1 * sin(e * 24.0);
        p.tilt = ev * 0.22 * sin(e * 24.0 - 0.6);
      }
    } else {
      p.roll += mix(0.05, 0.035, biped) * ev;
      p.tilt = ev * (biped > 0.5 ? 0.12 : 0.15 + 0.1 * sin(e * 9.0));
      p.pitch -= 0.02 * ev;
    }
    // The body turns a little with the head
    p.body = 0.3 * p.look;
  }
  return p;
}

vec3 walkMove(vec3 rel, float kind, float heading, float tempo, float radius, float t, float beat) {
  float seed = walkSeed(tempo);
  vec2 l = turnY(rel.xz, -heading);
  if (kind > 15.5) {
    // Hover: drifts about where it floats on a path that never quite repeats, rising and sinking, swaying, turning
    // to look this way and that and swelling with each breath; it never circles
    float breath = sin(t * 1.9 + seed * 6.283);
    rel.y *= 1.0 + 0.04 * breath;
    l *= 1.0 + 0.025 * breath;
    float tilt = 0.08 * sin(t * 0.7 + seed * 11.0);
    float x = l.x;
    l.x = cos(tilt) * x - sin(tilt) * rel.y;
    rel.y = sin(tilt) * x + cos(tilt) * rel.y;
    l = turnY(l, 0.6 * sin(t * 0.31 + seed * 9.0) + 0.25 * sin(t * 0.83 + seed * 3.0));
    if (gFace > 0.0) {
      float fd = atan(gFaceDir.x, gFaceDir.y) - heading;
      l = turnY(l, gFace * atan(sin(fd), cos(fd)));
    }
    l += radius * vec2(0.7 * sin(t * 0.29 + seed * 6.283) + 0.3 * sin(t * 0.71 + seed * 2.0), 0.7 * sin(t * 0.23 + seed * 4.0) + 0.3 * cos(t * 0.53 + seed * 5.0));
    rel.xz = turnY(l, heading);
    rel.y += radius * (0.35 * sin(t * 0.9 + seed * 6.283) + 0.15 * sin(t * 2.3 + seed * 3.0));
    return rel;
  }
  // A walking walker's sub marks a biped (0.25); a flyer's is its wingbeat rate / 128
  float biped = kind < 12.5 && abs(beat - 32.0) < 1.0 ? 1.0 : 0.0;
  Pose p = walkPose(kind, tempo, t, biped);
  float dir = fract(tempo * 37.3) < 0.5 ? -1.0 : 1.0;
  float lift = 0.0;
  if (kind < 12.5) {
    // Walk: dips on each footfall, sways over the supporting leg, the hips twisting; breathes while it stands
    lift = 0.07 * radius * p.lift;
    rel.y *= 1.0 + 0.025 * sin(t * 2.4 + seed * 6.283) * (1.0 - p.moving);
    l.x += 0.05 * radius * sin(p.step) * p.moving;
  } else if (kind < 13.5) {
    // Hop: squash, spring up, stretch in the air, land and wobble
    float h = abs(sin(p.step * 0.75));
    lift = 0.45 * radius * h * p.moving;
    float squash = (h - 0.35) * p.moving * 0.3 + 0.05 * sin(t * 3.0) * (1.0 - p.moving);
    rel.y *= 1.0 + squash;
    l *= 1.0 - squash * 0.5;
  } else if (kind < 14.5) {
    // Slither: a wave runs down the body
    l.x += 0.16 * radius * sin(l.y * 2.2 - t * 3.5) * (0.35 + 0.65 * p.moving);
  } else {
    // Fly: heaves up on each downstroke (gliding, it sinks a little)
    lift = radius * p.lift;
    if (beat > 0.0) {
      float glide = glideOf(t, tempo);
      lift += radius * (-0.06 * wingPos(t * beat + seed * 6.283 - 0.9) * (1.0 - glide) - 0.08 * glide);
    }
  }
  l = turnY(l, p.twist + p.body);
  vec3 r = leanRoll(vec3(l.x, rel.y, l.y), p.pitch, p.roll);
  l = r.xz;
  rel.y = r.y;
  // In a battle it turns on the spot to face its target, wherever the loop has brought it
  if (gFace > 0.0) {
    float fd = atan(gFaceDir.x, gFaceDir.y) - heading - p.turn;
    l = turnY(l, gFace * atan(sin(fd), cos(fd)));
  }
  // Onward round the loop, whose centre stands to its side
  vec2 c = vec2(dir * radius, 0.0);
  l = c + turnY(l - c, p.turn);
  if (kind > 14.5) {
    // A flyer's loop is no circle: it swings out and in as it goes
    vec2 outward = turnY(-c, p.turn) / max(radius, 0.001);
    l += outward * radius * 0.4 * sin(p.q * 2.6 + seed * 13.0);
  }
  rel.xz = turnY(l, heading);
  rel.y += lift;
  return rel;
}

// A seeded idle event every few seconds for a model standing as a whole: 0 looks round, 1 sniffs, 2 shakes, 3 shifts
float idleEvent(float t, float ph, out float kind, out float e) {
  float u = t / 5.5 + ph * 0.159;
  float n = floor(u);
  float h = iHash(n + ph * 7.3);
  kind = floor(iHash(n * 1.7 + ph * 3.1) * 4.0);
  e = fract(u) * 5.5 - (0.5 + h * 2.0);
  return h < 0.2 ? 0.0 : smoothstep(0.0, 0.3, e) * (1.0 - smoothstep(1.3, 1.7, e));
}

// axis: the model's ground point (an arm or torso turns with the shoulders about it)
vec3 idleMove(vec3 pos, vec3 anchor, vec4 info, vec3 axis) {
  vec3 rel = pos - anchor;
  // A small extra value rides in the kind's fraction (a wingbeat rate, a trailing part's lag)
  float kind = floor(info.x + 0.5);
  float sub = info.x - kind;
  float ph = info.y;
  float amp = info.w;
  // Each instance keeps its own tempo, so copies of one model never move in step
  float t = uIdleTime * info.z;
  float a = 0.0;
  if (kind > 18.5) {
    // Head, tail or torso of a walker, worked out from its pose (amp: its gait, plus 0.5 for a biped and a tail's
    // damping × 0.45)
    float gait = floor(amp);
    float biped = amp - gait > 0.475 ? 1.0 : 0.0;
    Pose p = walkPose(gait, info.z, t, biped);
    if (kind > 20.5) {
      // Torso: the shoulders turn against the hips
      vec3 r = pos - axis;
      r.xz = turnY(turnY(turnY(r.xz, -ph), -2.2 * p.twist), ph);
      return axis + r;
    }
    vec2 l = turnY(rel.xz, -ph);
    vec3 r = vec3(l.x, rel.y, l.y);
    if (kind > 19.5) {
      // Trail: replays the body's sway and turn from a moment ago (a spring, in closed form), wagging with the stride
      // and idly while it stands; damping 0 swings loosely, 1 barely trails
      float damp = (amp - gait - 0.5 * biped) / 0.45;
      float gain = 1.8 * (1.0 - damp) + 0.15;
      Pose o = walkPose(gait, info.z, t - sub * info.z, biped);
      float seed = walkSeed(info.z);
      float yaw = (o.turn + o.body + o.twist) - (p.turn + p.body + p.twist);
      // The wag runs down a chain of segments (each lags more), so a segmented tail ripples instead of swinging stiff
      yaw += 0.12 * sin(p.step * 0.5 - sub * 9.0) * p.moving + 0.1 * sin(t * 2.1 + seed * 9.0 - sub * 8.0) * (1.0 - p.moving);
      float pitch = (o.pitch - p.pitch) + 0.5 * (o.lift - p.lift) + 0.04 * sin(t * 1.3 + seed * 4.0 - sub * 6.0);
      float roll = o.roll - p.roll + 0.6 * (o.tilt - p.tilt);
      r = leanRoll(r, clamp(pitch * gain, -0.6, 0.6), clamp(roll * gain, -0.6, 0.6));
      r.xz = turnY(r.xz, clamp(yaw * gain, -0.8, 0.8));
    } else {
      // Head: undoes most of the body's lean and roll and all of its twist, so it rides steady; glances, nods, tilts
      r = leanRoll(r, -0.8 * p.pitch + p.nod, -0.8 * p.roll + p.tilt);
      r.xz = turnY(r.xz, p.look - p.body - p.twist);
    }
    rel.xz = turnY(r.xz, ph);
    rel.y = r.y;
    return anchor + rel;
  } else if (kind > 17.5) {
    // Flap: a wing beats from its shoulder, a quick power stroke down and a slower lift, now and then gliding a while
    float side = sign(amp);
    float u = t * abs(amp) + walkSeed(info.z) * 6.283;
    float glide = glideOf(t, info.z);
    // Raised well above level on the upstroke, swept below it on the downstroke; held just above level in a glide
    float f = side * mix(0.15 + 0.6 * wingPos(u), 0.06, glide);
    vec2 l = turnY(rel.xz, -ph);
    float x = l.x;
    l.x = cos(f) * x - sin(f) * rel.y;
    rel.y = sin(f) * x + cos(f) * rel.y;
    rel.xz = turnY(l, ph);
    return anchor + rel;
  } else if (kind > 16.5) {
    // Leg: swings from the hip while its walker steps. Arm (amp ±2): swings against its side's leg, smaller and a
    // beat behind, hangs with a little sway while it stands, and turns with the shoulders against the hips
    vec4 w;
    float cycle;
    float q = walkProgress(t, info.z, w, cycle);
    bool arm = abs(amp) > 1.5;
    float stride = q * 12.566;
    float sw = arm
      ? sign(amp) * (0.32 * sin(stride - 0.45) * w.x + 0.04 * sin(t * 1.1 + walkSeed(info.z) * 6.283) * (1.0 - w.x))
      : 0.5 * sign(amp) * sin(stride) * w.x;
    vec2 l = turnY(rel.xz, -ph);
    float c = cos(sw);
    float s = sin(sw);
    float y = rel.y;
    rel.y = c * y + s * l.y;
    l.y = c * l.y - s * y;
    rel.xz = turnY(l, ph);
    if (!arm) return anchor + rel;
    vec3 r = anchor + rel - axis;
    r.xz = turnY(turnY(turnY(r.xz, -ph), -0.18 * sin(stride) * w.x), ph);
    return axis + r;
  } else if (kind > 11.5) {
    return anchor + walkMove(rel, kind, ph, info.z, amp, t, sub * 128.0);
  } else if (kind < 0.5) {
    // Breathe: chest swells, the body slowly shifts and scans around, and now and then looks round, leans in, sways
    // slowly or shifts its weight (no dog's shake: bandits, treants, herds and caravans breathe)
    rel.y *= 1.0 + 0.035 * amp * sin(t * 2.4 + ph);
    rel.xz *= 1.0 + 0.015 * amp * sin(t * 2.4 + ph + 1.57);
    float ek;
    float e;
    float ev = idleEvent(t, ph, ek, e);
    a = 0.12 * amp * sin(t * 0.6 + ph * 1.7) + (ek < 0.5 ? 0.45 * ev * sin(e * 2.2) : 0.0);
    rel.z += rel.y * (ek > 0.5 && ek < 1.5 ? 0.06 * ev : 0.0);
    rel.x += rel.y * (ek > 1.5 && ek < 2.5 ? 0.035 * ev * sin(e * 3.0) : ek > 2.5 ? 0.035 * ev : 0.0);
  } else if (kind < 1.5) {
    // Float: buoyant bob, drift and a lazy turn (bats, harpies, drakes, wraiths)
    rel.y += 0.18 * amp * sin(t * 1.6 + ph);
    rel.x += 0.08 * amp * sin(t * 1.1 + ph);
    rel.z += 0.06 * amp * sin(t * 0.8 + ph * 1.3);
    a = 0.3 * amp * sin(t * 0.5 + ph);
  } else if (kind < 2.5) {
    // Bob: treasure gently rising and settling
    rel.y += 0.05 + 0.05 * amp * sin(t * 1.8 + ph);
  } else if (kind < 3.5) {
    // Parts without idle data in an idle batch stay still
  } else if (kind < 4.5) {
    // Sway: bends from the base, the top moving most (trees, crops, masts, tentacles)
    float k = 0.07 * amp * sin(t * 1.3 + ph) + 0.025 * sin(t * 3.1 + ph * 2.0);
#ifdef PART_HD
    // HD: a tree bends more the higher it reaches, and the gusts that roll across the grass roll through it too
    float bend = rel.y * (0.35 + 0.65 * smoothstep(0.0, 3.0, rel.y));
    float gust = sin(uIdleTime * 0.55 + anchor.x * 0.07 + anchor.z * 0.05) * 0.8 + 0.4;
    rel.x += bend * k * 0.8;
    rel.z += bend * 0.04 * amp * sin(t * 0.9 + ph * 1.4);
    rel.xz += vec2(0.82, 0.57) * bend * gust * 0.03;
#else
    rel.x += rel.y * k;
    rel.z += rel.y * 0.05 * amp * sin(t * 0.9 + ph * 1.4);
#endif
  } else if (kind < 5.5) {
    // Spin about the vertical axis through the anchor: a part on it turns, a part off it orbits
    a = t * 0.9 + ph;
  } else if (kind < 6.5) {
    // Pulse: glows swell and fade
    rel *= 1.0 + 0.1 * amp * (0.5 + 0.5 * sin(t * 2.2 + ph));
  } else if (kind < 7.5) {
    // Smoke: a puff rises, swells and fades out, then starts again at the chimney
    float u = fract(t * 0.22 + ph * 0.159);
    rel *= (0.45 + u * 1.2) * (1.0 - smoothstep(0.65, 1.0, u));
    rel.y += u * 2.2 * amp;
    rel.x += u * u * 0.6 * sin(ph);
    rel.z += u * u * 0.6 * cos(ph);
  } else if (kind < 8.5) {
    // Flutter: cloth ripples away from its pole
    float reach = clamp(abs(rel.x) + abs(rel.z), 0.0, 1.5);
    rel.z += 0.12 * amp * reach * sin(t * 5.0 + ph - (rel.x + rel.y) * 4.0);
    a = 0.1 * amp * sin(t * 1.4 + ph);
  } else if (kind < 9.5) {
    // Prowl: weight shifts, breath, looks round in steps and now and then hunches as if to lunge
    float l = sin(t * 0.33 + ph);
    a = 0.4 * amp * sign(l) * smoothstep(0.15, 0.75, abs(l)) + 0.05 * sin(t * 1.7 + ph);
    float w = fract(t * 0.09 + ph * 0.159);
    float hunch = smoothstep(0.0, 0.04, w) * (1.0 - smoothstep(0.06, 0.14, w));
    rel.y *= 1.0 + 0.04 * amp * sin(t * 2.6 + ph) - 0.12 * amp * hunch;
    rel.x += 0.05 * amp * sin(t * 0.8 + ph);
    rel.xz *= 1.0 + 0.05 * amp * hunch;
    // …and in between sniffs the air, shakes itself or shifts its weight
    float ek;
    float e;
    float ev = idleEvent(t, ph + 1.3, ek, e);
    rel.z += rel.y * (ek < 1.5 ? 0.07 * ev : 0.0);
    rel.x += rel.y * (ek > 1.5 && ek < 2.5 ? 0.05 * ev * sin(e * 22.0) : ek > 2.5 ? 0.04 * ev : 0.0);
  } else if (kind < 10.5) {
    // Heartbeat: a magical site swells a touch, then rests
    rel *= 1.0 + pow(max(0.0, sin(t * 1.4 + ph)), 4.0) * 0.03 * amp;
  } else if (kind < 11.5) {
    // Rock: a wreck rolls and pitches on the swell
    float rz = 0.05 * amp * sin(t * 0.7 + ph);
    float rx = 0.03 * amp * sin(t * 0.5 + ph + 1.0);
    rel.xy = vec2(cos(rz) * rel.x - sin(rz) * rel.y, sin(rz) * rel.x + cos(rz) * rel.y);
    rel.yz = vec2(cos(rx) * rel.y - sin(rx) * rel.z, sin(rx) * rel.y + cos(rx) * rel.z);
  }
  float c = cos(a);
  float s = sin(a);
  rel.xz = vec2(c * rel.x - s * rel.z, s * rel.x + c * rel.z);
  return anchor + rel;
}
`;

/*
 * A pack in a live battle on the map (`world/npcStrikes.ts`): each of its creatures strikes on the round (coils back and
 * crouches, lunges at the armies with its impact mid-swing, follows through and recovers) and rears back as the pack
 * casts (rises, holds it a trembling beat, then hurls itself forward as the spell flies). It moves as a whole about its
 * own feet (its walker's anchor), leaning by a shear so it never pivots about a place it has walked away from; its beat,
 * reach and lean come from its place and the round, so no two strike alike.
 */
const FIGHT_FUNCTION = `
attribute float aFight;
uniform vec4 uFight[${FIGHT_SLOTS * FIGHT_VEC4S}];
void fightFace(float key) {
  if (key < 0.5) return;
  for (int i = 0; i < ${FIGHT_SLOTS}; i++) {
    float slotKey = uFight[i * ${FIGHT_VEC4S}].x;
    if (slotKey < 0.5) break;
    if (abs(slotKey - key) > 0.5) continue;
    vec4 c = uFight[i * ${FIGHT_VEC4S} + 2];
    gFace = c.y;
    gFaceDir = c.zw;
    return;
  }
}
vec3 fightMove(vec3 pos, vec3 feet, float key) {
  if (key < 0.5) return pos;
  for (int i = 0; i < ${FIGHT_SLOTS}; i++) {
    vec4 a = uFight[i * ${FIGHT_VEC4S}];
    // The slots fill from the first: an empty one ends the list
    if (a.x < 0.5) break;
    if (abs(a.x - key) > 0.5) continue;
    vec4 b = uFight[i * ${FIGHT_VEC4S} + 1];
    float reach = uFight[i * ${FIGHT_VEC4S} + 2].x;
    float h = iHash(dot(feet.xz, vec2(0.731, 1.37)) + a.w * 3.17);
    float h2 = iHash(h * 91.3 + 4.1);
    float lunge = 0.0;
    float lean = 0.0;
    float squash = 0.0;
    float rise = 0.0;
    // The strike: a slow coil, a fast lunge with its impact mid-swing, a follow-through, then back
    float t = a.y - 0.35 * h;
    if (t > 0.0 && t < 1.6) {
      float coil = smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.3, 0.42, t));
      float hit = smoothstep(0.32, 0.46, t) * (1.0 - smoothstep(0.62, 1.45, t));
      lunge += reach * (0.55 + 0.45 * h2) * (hit - 0.3 * coil);
      lean += (0.22 + 0.16 * h) * hit - 0.14 * coil;
      squash += 0.1 * coil;
    }
    // The cast: rears back and rises, trembles a beat, then hurls itself at the armies
    float c = a.z - 0.2 * h;
    if (c > 0.0 && c < 1.8) {
      float rear = smoothstep(0.0, 0.45, c) * (1.0 - smoothstep(0.8, 1.0, c));
      float hurl = smoothstep(0.8, 0.98, c) * (1.0 - smoothstep(1.1, 1.75, c));
      lean += 0.2 * hurl - 0.22 * rear;
      rise += reach * rear * (0.16 + 0.015 * sin(c * 38.0 + h * 6.283));
      squash -= 0.07 * rear;
      lunge += reach * 0.3 * hurl;
    }
    float up = max(pos.y - feet.y, 0.0);
    pos.y = feet.y + (pos.y - feet.y) * (1.0 - squash) + rise;
    pos.xz += b.zw * (lunge + up * lean);
    return pos;
  }
  return pos;
}
`;

const IDLE_VERTEX = `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
#ifdef PART_FIGHT
fightFace(aFight);
#endif
mvPosition.xyz = idleMove(mvPosition.xyz, aIdleAnchor, aIdle, aModelAnchor);
mvPosition.xyz = idleMove(mvPosition.xyz, aModelAnchor, aModel, aModelAnchor);
#ifdef PART_FIGHT
mvPosition.xyz = fightMove(mvPosition.xyz, aModelAnchor, aFight);
#endif
vec3 partWorld = mvPosition.xyz;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;
`;

/*
 * HD surface detail (`hd`, the world map's scatter): each crafted shape gets the texture of what it is made of, drawn
 * in world space and faded out by its size on screen (fwidth) so the zoomed-out map stays clean: bark grooves on
 * trunks (ribs on cacti), clumped leaves darker inside the crown with a little hue per tree, cracked stone with moss
 * or sand settled on top, coursed masonry (wood grain on timber), and a crust of cooling lava over glowing cracks.
 */
const SURFACE: Partial<Record<Shape, number>> = { trunk: 1, pine: 2, canopy: 2, boulder: 3, block: 4, arch: 4, cyl: 4 };
/** Smooth-shaded crafted shapes (the rest keep their facets) */
const SMOOTH = new Set<Shape>(["trunk", "canopy", "sphere"]);

const HD_VERTEX_PARS = `
varying vec3 vSW;
varying vec3 vSL;
varying vec3 vSN;
varying float vSeed;`;

const HD_VERTEX = `
vSL = position;
vSN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
vSW = (modelMatrix * vec4(partWorld, 1.0)).xyz;
vec3 seedAt = instanceMatrix[3].xyz;
vSeed = fract(sin(dot(seedAt.xz, vec2(12.9898, 78.233)) + seedAt.y * 3.1) * 43758.5453);`;

export const HD_FRAGMENT_PARS = `
uniform float uIdleTime;
varying vec3 vSW;
varying vec3 vSL;
varying vec3 vSN;
varying float vSeed;
float pHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float pNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), u.x), mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float pCrack(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); float d1 = 8.0; float d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 r = g + vec2(pHash(i + g), pHash(i + g + 17.3)) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(max(d2, 0.0)) - sqrt(max(d1, 0.0));
}`;

const HD_FRAGMENT_COLOR = `
#include <color_fragment>
{
  float px = max(length(fwidth(vSW)), 1e-4);
  float mid = smoothstep(0.24, 0.08, px);
  float fine = smoothstep(0.085, 0.03, px);
  vec3 col = diffuseColor.rgb;
  float low = vSL.y + 0.5; // 0 at the part's foot, 1 at its top
#if SURF == 1
  // Bark: grooves running up the trunk (ribs on a cactus), darker where it meets the ground
  float ang = atan(vSL.z, vSL.x + 1e-5);
  float groove = pNoise(vec2(ang * 2.2 + pNoise(vSW.xz * 3.0) * 0.6, vSW.y * 1.4));
  col *= mix(1.0, 0.7 + 0.42 * groove, mid);
  if (fine > 0.0) col *= mix(1.0, 0.86 + 0.24 * pNoise(vec2(ang * 9.0, vSW.y * 9.0)), fine);
  col *= mix(0.72, 1.0, smoothstep(0.0, 0.18, low));
#elif SURF == 2
  // Leaves: clumps with dark gaps, darker inside and under the crown, sunlit on top; each tree its own shade
  float clump = pNoise(vSW.xz * 1.7 + vSW.y * 1.3) * 0.65 + pNoise(vSW.xz * 3.6 - vSW.y * 2.1) * 0.35;
  col *= mix(1.0, 0.55 + 0.75 * clump, mid);
  if (fine > 0.0) col *= mix(1.0, 0.82 + 0.3 * pNoise(vSW.xz * 9.0 + vSW.y * 7.0), fine);
  col *= 0.66 + 0.34 * smoothstep(0.0, 0.85, low);
  col *= 1.0 + 0.12 * max(vSN.y, 0.0);
  col *= vec3(1.0 + (vSeed - 0.5) * 0.16, 1.0 + (fract(vSeed * 7.13) - 0.5) * 0.1, 1.0 - (vSeed - 0.5) * 0.08);
#elif SURF == 3
  // Stone: cracks and grain; moss (sand on warm desert stone) settled on top
  float crack = smoothstep(0.0, 0.08, pCrack(vSW.xz * 1.1 + vec2(vSW.y * 0.9, -vSW.y * 0.6)));
  col *= mix(1.0, (0.8 + 0.3 * pNoise(vSW.xz * 2.3 + vSW.y)) * (0.62 + 0.38 * crack), mid);
  if (fine > 0.0) col *= mix(1.0, 0.86 + 0.26 * pHash(floor(vSW.xz * 11.0 + vSW.y * 7.0)), fine);
  float warm = smoothstep(0.05, 0.18, col.r - col.b);
  float cap = smoothstep(0.45, 0.8, vSN.y) * smoothstep(0.3, 0.55, low) * smoothstep(0.2, 0.5, pNoise(vSW.xz * 0.9 + vSeed * 9.0) + 0.25);
  col = mix(col, mix(vec3(0.27, 0.4, 0.17), vec3(0.8, 0.67, 0.45), warm) * (0.85 + 0.3 * pNoise(vSW.xz * 4.0)), cap * 0.85);
  col *= mix(0.68, 1.0, smoothstep(0.0, 0.3, low));
#elif SURF == 4
  // Masonry: courses of dressed stone round the face, mortar between; timber (strong colours) shows grain instead
  float hi = max(col.r, max(col.g, col.b));
  float sat = (hi - min(col.r, min(col.g, col.b))) / max(hi, 1e-3);
  float side = 1.0 - smoothstep(0.55, 0.85, abs(vSN.y));
  vec2 tg = vec2(vSN.z, -vSN.x);
  float tl = length(tg);
  tg = tl > 1e-3 ? tg / tl : vec2(1.0, 0.0);
  float rows = smoothstep(0.11, 0.045, px);
  if (sat > 0.42) {
    float grain = pNoise(vec2(dot(vSW.xz, tg) * 0.8, vSW.y * 16.0 + dot(vSW.xz, vec2(-tg.y, tg.x)) * 16.0));
    col *= mix(1.0, 0.8 + 0.3 * grain, mid);
  } else {
    float row = vSW.y / 0.32;
    float ri = floor(row);
    float u = dot(vSW.xz, tg) / 0.58 + ri * 0.5 + pHash(vec2(ri, 3.0)) * 0.3;
    float fy = fract(row);
    float fx = fract(u);
    float stone = smoothstep(0.0, 0.1, fy) * smoothstep(1.0, 0.9, fy) * smoothstep(0.0, 0.06, fx) * smoothstep(1.0, 0.94, fx);
    float tone = 0.86 + 0.24 * pHash(vec2(floor(u), ri));
    col *= mix(1.0, mix(0.62, tone, stone), rows * side);
    col *= mix(1.0, 0.86 + 0.24 * pNoise(vSW.xz * 2.5 + vSW.y * 2.0), mid);
    if (fine > 0.0) col *= mix(1.0, 0.9 + 0.18 * pNoise(vSW.xz * 10.0 + vSW.y * 10.0), fine);
  }
  col *= mix(0.74, 1.0, smoothstep(0.0, 0.25, low));
#elif SURF == 5
  // Lava: plates of dark cooling crust drifting over glowing cracks that breathe
  float cell = pCrack(vSW.xz * 1.6 + vec2(0.0, uIdleTime * 0.04));
  float glowLine = 1.0 - smoothstep(0.02, 0.2, cell);
  float breathe = 0.75 + 0.25 * sin(uIdleTime * 1.6 + pHash(floor(vSW.xz * 1.6)) * 6.2832);
  col = mix(vec3(0.09, 0.05, 0.04) * (0.8 + 0.4 * pNoise(vSW.xz * 5.0)), col * 1.5 * breathe, max(glowLine, 0.12));
#else
  col *= mix(1.0, 0.9 + 0.18 * pNoise(vSW.xz * 2.0 + vSW.y * 1.7), mid);
#endif
  diffuseColor.rgb = col;
}`;

/*
 * The HD model kit (`kit`, creatures and sites on the world map and in the Codex): the same parts drawn through bevelled
 * twins of their shapes (or their `hdShape`), with HD-only parts, a relaxed rest pose (`pose`) and per-instance
 * materials: each part's roughness, metalness and surface (`mat`) ride in instance attributes, so one draw per shape
 * still covers every material. Surfaces are drawn in the part's own space (they stay on a walking creature) and fade
 * by size on screen; soft ambient occlusion darkens each part's foot, undersides and everything near the model's ground.
 */
/** Kit shapes that keep their facets (the rest are smooth-shaded in the kit) */
export const FLAT_KIT = new Set<Shape>(["pyramid", "prism", "octa", "boulder", "block", "arch", "pine", "blade"]);
/** Kit shapes that get a slight seeded bulge per instance, so no two heads or bodies are quite alike */
export const ORGANIC = new Set<Shape>(["sphere", "egg", "drop", "capsule"]);
/** No ground under the part (no contact shadow) */
const NO_BASE = -1e4;

const KIT_VERTEX_PARS = `
attribute vec3 aMat;
attribute float aBase;
varying vec3 vMat;
varying float vBase;
varying vec3 vSize;`;

const KIT_VERTEX = `
vMat = aMat;
vBase = aBase;
vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));`;

const KIT_ORGANIC_VERTEX = (idle: boolean) => `#include <begin_vertex>
{
  vec3 at = instanceMatrix[3].xyz;
  float s = fract(sin(dot(at.xz, vec2(12.9898, 78.233)) + at.y * 3.1) * 43758.5453) * 6.2832;
  transformed += objectNormal * 0.035 * (sin(position.x * 5.1 + s) * sin(position.y * 4.3 + s * 1.7) + 0.6 * sin(position.z * 6.7 - s));${
    idle
      ? `
  // Gel wobbles: slow ripples running over it, seeded per part
  if (abs(aMat.x - 12.0) < 0.5) transformed += objectNormal * 0.045 * sin(uIdleTime * 2.6 + s + position.y * 7.0 + position.x * 4.0) * (0.6 + 0.4 * sin(uIdleTime * 0.9 + s * 2.0));`
      : ""
  }
}`;

export const KIT_FRAGMENT_PARS = `
varying vec3 vMat;
varying float vBase;
varying vec3 vSize;
float kRough;
float kMetal;
vec3 kEmit;
float kHeight;
// Bumps the normal by the surface's height (world units) from its screen-space slope (no tangents needed)
vec3 kBump(vec3 pos, vec3 n, float h) {
  vec3 sx = dFdx(pos);
  vec3 sy = dFdy(pos);
  vec3 r1 = cross(sy, n);
  vec3 r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  // Never normalise a zero vector (NaN blacks out an HD frame through bloom)
  return normalize(abs(det) * n - grad + n * 1e-7);
}`;

export const KIT_FRAGMENT_COLOR = `
#include <color_fragment>
kRough = vMat.y;
kMetal = vMat.z;
kEmit = vec3(0.0);
kHeight = 0.0;
{
  // The part's own space in world units: patterns stay on a part as it walks
  vec3 p = vSL * vSize;
  float px = max(length(fwidth(p)), 1e-4);
  float mid = smoothstep(0.16, 0.04, px);
  float fine = smoothstep(0.05, 0.015, px);
  vec3 col = diffuseColor.rgb;
  float id = floor(vMat.x + 0.5);
  float low = vSL.y + 0.5;
  vec2 sp = p.xz + p.y * vec2(0.37, -0.61) + vSeed * 37.0;
  // How near an edge of the part (the second-nearest face), for worn metal and dark leather seams
  vec3 dd = (0.5 - abs(vSL)) * vSize;
  float m2 = max(min(dd.x, dd.y), min(max(dd.x, dd.y), dd.z));
  float edge = 1.0 - smoothstep(0.0, 0.035, m2);
  // The facet's own normal in the part's space (roof tiles run along it); taken outside the branches, where derivatives hold
  vec3 fn = cross(dFdx(p), dFdy(p));
  if (mid > 0.0) {
    if (id < 0.5) {
      // Plain: soft mottling
      col *= mix(1.0, 0.9 + 0.18 * pNoise(sp * 3.0), mid);
    } else if (id < 1.5) {
      // Fur: strands running back and down the body, gathered in clumps, sun-bleached on top
      vec2 fp = vec2((p.x + p.y * 0.5) * 34.0 + pNoise(p.xz * 3.0 + p.y) * 4.0, p.z * 5.0 + p.y * 7.0) + vSeed * 9.0;
      float strand = pNoise(fp) * 0.65 + pNoise(fp * vec2(2.3, 1.7)) * 0.35;
      float clump = pNoise(p.xz * 6.0 + p.y * 6.0 + vSeed * 3.0);
      // Dark at the roots between strands, lighter at the tips, gathered in clumps
      col *= mix(1.0, (0.5 + 0.75 * strand) * (0.78 + 0.36 * clump), mid);
      col *= 1.0 + 0.1 * max(vSN.y, 0.0);
      kRough = 0.85 + 0.15 * strand;
      kHeight = strand * 0.0025;
    } else if (id < 2.5) {
      // Hide: blotches and scars
      float blot = pNoise(sp * 2.2) * 0.6 + pNoise(sp * 6.0) * 0.4;
      col *= mix(1.0, 0.76 + 0.4 * blot, mid);
      float grain = fine > 0.0 ? pNoise(sp * 22.0) : 0.5;
      col *= mix(1.0, 0.9 + 0.16 * grain, fine);
      kHeight = (blot * 0.6 + grain * 0.4 * fine) * 0.004;
    } else if (id < 3.5) {
      // Skin: soft mottling and fine pores
      col *= mix(1.0, 0.95 + 0.08 * pNoise(sp * 3.0), mid);
      float pore = fine > 0.0 ? pNoise(sp * 30.0) : 0.5;
      col *= mix(1.0, 0.97 + 0.05 * pore, fine);
      kRough = 0.6 + 0.15 * pNoise(sp * 7.0);
      kHeight = pore * fine * 0.001;
    } else if (id < 4.5) {
      // Cloth: soft folds hanging down, a weave up close, the hem darker
      float fold = pNoise(vec2((p.x + p.z) * 5.0, p.y * 1.3) + vSeed * 5.0);
      col *= mix(1.0, 0.8 + 0.32 * fold, mid);
      float weave = 0.0;
      if (fine > 0.0) {
        weave = abs(sin((p.x + p.z) * 140.0)) * abs(sin(p.y * 140.0));
        col *= mix(1.0, 0.95 + 0.07 * weave, fine);
      }
      kHeight = fold * 0.008 + weave * fine * 0.0006;
      col *= mix(0.84, 1.0, smoothstep(0.0, 0.12, low));
    } else if (id < 5.5) {
      // Leather: creases, worn darker at the seams, a little sheen where it is rubbed
      float crease = pNoise(sp * 7.0) * 0.6 + pNoise(sp * 17.0) * 0.4;
      col *= mix(1.0, 0.78 + 0.32 * crease, mid);
      col *= 1.0 - 0.28 * edge * mid;
      kRough = 0.5 + 0.25 * crease;
      kHeight = crease * 0.003;
    } else if (id < 6.5) {
      // Wood: grain along the part's length
      float along = vSize.y >= max(vSize.x, vSize.z) ? p.y : (vSize.x >= vSize.z ? p.x : p.z);
      float across = vSize.y >= max(vSize.x, vSize.z) ? p.x + p.z : (vSize.x >= vSize.z ? p.y + p.z : p.x + p.y);
      float grain = pNoise(vec2(along * 1.6, across * 26.0 + pNoise(vec2(along * 3.0, across * 4.0)) * 2.5));
      col *= mix(1.0, 0.72 + 0.4 * grain, mid);
      col *= 1.0 - 0.2 * edge * mid;
      kHeight = grain * 0.004;
    } else if (id < 7.5) {
      // Bone: porous ivory, darker toward its ends
      float pit = pNoise(sp * 5.0);
      col *= mix(1.0, 0.9 + 0.14 * pit, mid);
      // Fine pores: soft dark pits, never square speckles
      if (fine > 0.0) col *= mix(1.0, 1.0 - 0.14 * smoothstep(0.62, 0.8, pNoise(sp * 40.0)), fine);
      kHeight = pit * 0.002;
      col *= mix(0.82, 1.0, smoothstep(0.0, 0.2, min(low, 1.0 - low)));
    } else if (id < 8.5) {
      // Stone: cracks and grain
      float crack = smoothstep(0.0, 0.08, pCrack(sp * 2.6));
      float lump = pNoise(sp * 3.5);
      col *= mix(1.0, (0.82 + 0.28 * lump) * (0.66 + 0.34 * crack), mid);
      kHeight = (crack * 0.6 + lump * 0.4) * 0.012;
    } else if (id < 9.5) {
      // Metal: bright worn edges and scratches, grime in the hollows
      float grime = pNoise(sp * 5.0);
      float wear = edge * (0.55 + 0.45 * pNoise(sp * 9.0));
      float scratch = fine > 0.0 ? smoothstep(0.9, 0.97, pNoise(vec2(dot(p.xz, vec2(46.0, 9.0)) + p.y * 40.0, p.y * 2.0 + vSeed * 7.0))) * fine : 0.0;
      col *= mix(1.0, 0.82 + 0.22 * grime, mid);
      col = mix(col, col * 1.45 + 0.05, max(wear, scratch) * mid);
      kRough = mix(vMat.y + 0.18 * (1.0 - grime), vMat.y * 0.45, max(wear, scratch));
      kHeight = grime * 0.0015 - scratch * 0.0005;
      col *= mix(0.72, 1.0, smoothstep(0.0, 0.3, low));
    } else if (id < 10.5) {
      // Gem: facets catching the light
      float facet = pHash(floor(p.xz * 18.0 + p.y * 11.0));
      col *= 0.8 + 0.4 * facet;
      kEmit = col * 0.08;
    } else if (id < 11.5) {
      // Lava: a dark crust breaking over glowing cracks that breathe
      float cell = pCrack(sp * 3.4 + vec2(0.0, uIdleTime * 0.03));
      float line = 1.0 - smoothstep(0.015, 0.075, cell);
      float breathe = 0.75 + 0.25 * sin(uIdleTime * 1.6 + pHash(floor(sp * 3.4)) * 6.2832);
      // The cracks glow molten orange (or brighter in the part's own colour when it is a hot one)
      vec3 hot = max(col * 1.2, vec3(0.95, 0.3, 0.04));
      col = mix(vec3(0.09, 0.05, 0.04) * (0.8 + 0.4 * pNoise(sp * 5.0)), hot, line);
      kEmit = hot * line * 0.9 * breathe;
      kHeight = (1.0 - line) * 0.015;
    } else if (id < 12.5) {
      // Gel: wet slime, lit through and paler at its rim, deep and dense at its heart, swirling slowly, bubbles rising
      vec3 view = normalize(cameraPosition - vSW);
      float facing = clamp(dot(normalize(vSN), view), 0.0, 1.0);
      float rim = (1.0 - facing) * (1.0 - facing);
      float swirl = pNoise(sp * 1.6 + vec2(uIdleTime * 0.05, -uIdleTime * 0.11));
      vec3 deep = col * (0.5 + 0.22 * swirl);
      vec3 lit = col * 1.3 + vec3(0.05, 0.07, 0.02);
      col = mix(col, mix(deep, lit, rim), mid);
      // Bubbles drifting up through it
      vec2 bp = vec2((p.x + p.z) * 6.0, p.y * 6.0 - uIdleTime * 0.35) + vSeed * 17.0;
      float bn = pNoise(bp);
      float bub = smoothstep(0.78, 0.86, bn) * (1.0 - 0.6 * smoothstep(0.86, 0.95, bn));
      col += lit * bub * 0.35 * fine;
      kRough = 0.06 + 0.1 * swirl;
      // Light scattering through the jelly at its rim (soft, never a glow)
      kEmit = lit * rim * 0.12 * mid;
      kHeight = swirl * 0.004;
    } else if (id < 13.5) {
      // Leaf: clumps of leaves (or ears of grain) with dark gaps, darker inside and low down, sunlit on top, each part
      // its own shade
      float clump = pNoise(sp * 4.0) * 0.6 + pNoise(sp * 9.0) * 0.4;
      col *= mix(1.0, 0.6 + 0.6 * clump, mid);
      if (fine > 0.0) col *= mix(1.0, 0.86 + 0.24 * pNoise(sp * 26.0), fine);
      col *= 0.78 + 0.22 * smoothstep(0.0, 0.9, low);
      col *= 1.0 + 0.12 * max(vSN.y, 0.0);
      col *= vec3(1.0 + (vSeed - 0.5) * 0.14, 1.0 + (fract(vSeed * 7.13) - 0.5) * 0.08, 1.0 - (vSeed - 0.5) * 0.08);
      kRough = 0.65 + 0.25 * clump;
      kHeight = clump * 0.008;
    } else if (id < 14.5) {
      // Masonry: courses of dressed stone round its sides (along a box's face, round a cylinder by angle), flagstones
      // on top; the joints sunk in, each block its own shade
      vec3 q = abs(vSL);
      float along = q.x > 0.495 ? p.z : q.z > 0.495 ? p.x : atan(vSL.z, vSL.x + 1e-5) * 0.5 * vSize.x;
      vec2 g = q.y >= max(q.x, q.z) ? vec2(p.x / 0.62, p.z / 0.42) : vec2(along / 0.55, p.y / 0.28);
      float row = floor(g.y);
      g.x += row * 0.5 + pHash(vec2(row, 7.0)) * 0.3;
      vec2 f = fract(g);
      float joint = smoothstep(0.0, 0.06, f.x) * smoothstep(1.0, 0.94, f.x) * smoothstep(0.0, 0.09, f.y) * smoothstep(1.0, 0.91, f.y);
      float tone = 0.86 + 0.24 * pHash(floor(g) + vSeed * 11.0);
      col *= mix(1.0, mix(0.66, tone, joint), mid);
      if (fine > 0.0) col *= mix(1.0, 0.92 + 0.14 * pNoise(sp * 9.0), fine);
      kRough = vMat.y * (0.9 + 0.2 * tone);
      kHeight = (joint - 1.0) * 0.012;
    } else {
      // Tiles: rows of overlapping tiles down a roof, staggered along its eaves (each facet's own run), each lip
      // shading the top of the row below, each tile its own shade
      vec2 run = vec2(-fn.z, fn.x) / max(length(fn.xz), 1e-5);
      float rows = p.y * 6.5;
      float row = floor(rows);
      float cols = dot(p.xz, run) * 3.6 + row * 0.5;
      float f = fract(rows);
      float gap = smoothstep(0.0, 0.08, fract(cols)) * smoothstep(1.0, 0.92, fract(cols));
      float shade = pHash(vec2(floor(cols), row) + vSeed * 13.0);
      // Faces turned up, by the facet's own normal (a prism's or pyramid's vertex normals bend round its eaves)
      float k = smoothstep(0.15, 0.35, fn.y / max(length(fn), 1e-6));
      col *= mix(1.0, mix(0.72, 1.0, gap) * mix(1.0, 0.7, smoothstep(0.7, 1.0, f)) * (0.86 + shade * 0.24), k);
      kRough = mix(vMat.y, vMat.y * (0.85 + 0.3 * shade), k);
      kHeight = (1.0 - f) * 0.01 * k;
    }
  }
  kHeight *= mid;
  // Soft ambient occlusion: darker near the model's ground, under every part and at each part's foot
  col *= mix(0.6, 1.0, smoothstep(0.0, 0.45, vSW.y - vBase));
  col *= 1.0 - 0.22 * max(-vSN.y, 0.0);
  col *= mix(0.84, 1.0, smoothstep(0.0, 0.25, low));
  diffuseColor.rgb = col;
}`;

/**
 * HD: courses laid over the kit's surface (the world-map castles and the city's town hall; `vCourse` per vertex). Dressed stone (1 on flat walls, 2 round a tower): courses and joints in world
 * space, each block its own shade and roughness, the mortar sunk in; only on upright faces. Roof tiles (3): rows of
 * overlapping tiles down a roof, each lip casting a little shadow on the row below. Both fade out where they get too
 * small on screen to read, so distant castles don't shimmer.
 */
export const HD_COURSES = /* glsl */ `
if (vCourse > 0.5) {
  vec3 an = abs(normalize(vSN));
  vec3 col = diffuseColor.rgb;
  if (vCourse < 2.5) {
    float wall = 1.0 - smoothstep(0.6, 0.8, an.y);
    float along = vCourse > 1.5 ? atan(vSL.z, vSL.x + 1e-5) * 0.5 * vSize.x : (an.x > an.z ? vSW.z : vSW.x);
    float rows = vSW.y * 4.2;
    float row = floor(rows);
    float cols = along * 2.2 + row * 0.5;
    vec2 f = vec2(fract(cols), fract(rows));
    float joint = smoothstep(0.0, 0.07, f.x) * smoothstep(1.0, 0.93, f.x) * smoothstep(0.0, 0.1, f.y) * smoothstep(1.0, 0.9, f.y);
    float shade = pHash(vec2(floor(cols), row));
    float k = wall * clamp(1.6 - max(fwidth(rows), fwidth(cols)) * 3.0, 0.0, 1.0);
    col *= mix(1.0, mix(0.66, 1.0, joint) * (0.86 + shade * 0.24), k);
    kRough = mix(kRough, kRough * (0.85 + shade * 0.3), k);
    kHeight += (joint - 1.0) * 0.01 * k;
  } else {
    float roof = smoothstep(0.15, 0.35, vSN.y);
    float rows = vSW.y * 7.0;
    float row = floor(rows);
    float cols = atan(vSL.z, vSL.x + 1e-5) * 4.5 + row * 0.5;
    float f = fract(rows);
    float gap = smoothstep(0.0, 0.08, fract(cols)) * smoothstep(1.0, 0.92, fract(cols));
    float shade = pHash(vec2(floor(cols), row));
    float k = roof * clamp(1.6 - max(fwidth(rows), fwidth(cols)) * 3.0, 0.0, 1.0);
    col *= mix(1.0, mix(0.7, 1.0, gap) * mix(1.0, 0.72, smoothstep(0.7, 1.0, f)) * (0.88 + shade * 0.22), k);
    kHeight += (1.0 - f) * 0.008 * k;
  }
  diffuseColor.rgb = col;
}
`;

const frac = (v: number) => v - Math.floor(v);
/** Tempo (0.8–1.25×) and size (0.75–1.3×) of an idle that didn't set its own, spread by its phase */
export const idleSpeed = (phase: number) => 0.8 + frac(phase * 7.13) * 0.45;
export const idleAmp = (phase: number) => 0.75 + frac(phase * 3.71) * 0.55;

function usePartMaterial(glow: boolean, idle: boolean, hd: boolean, shape: Shape, kit: boolean, fight = false) {
  const material = useMemo(() => {
    if (!idle && !hd && !kit) return null;
    const smooth = (hd && SMOOTH.has(shape)) || (kit && !FLAT_KIT.has(shape));
    const m = glow ? new THREE.MeshBasicMaterial({ toneMapped: false }) : new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: !smooth });
    const uniforms = { uIdleTime: { value: 0 }, uFight: { value: FIGHT_UNIFORM } };
    const fights = idle && fight;
    // Lava (a glowing block) gets its crust; lit shapes the surface of what they are made of; other glows stay plain.
    // The model kit's lit parts take their surface from the instance (-2)
    const surface = kit ? (glow ? -1 : -2) : !hd ? -1 : glow ? (shape === "block" ? 5 : -1) : (SURFACE[shape] ?? 0);
    const organic = kit && !glow && ORGANIC.has(shape);
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uIdleTime = uniforms.uIdleTime;
      if (fights) shader.uniforms.uFight = uniforms.uFight;
      const defines = hd || kit ? `#define PART_HD\n#define SURF ${surface}\n` : "";
      let vs = shader.vertexShader;
      if (idle) {
        vs = vs
          .replace("void main() {", `${defines}${fights ? "#define PART_FIGHT\n" : ""}attribute vec3 aIdleAnchor;\nattribute vec4 aIdle;\nattribute vec3 aModelAnchor;\nattribute vec4 aModel;\nuniform float uIdleTime;\n${IDLE_FUNCTION}\n${fights ? FIGHT_FUNCTION : ""}\nvoid main() {`)
          .replace("#include <project_vertex>", `${IDLE_VERTEX}\n#include <part_hd>`);
      } else {
        vs = vs.replace("#include <project_vertex>", "#include <project_vertex>\nvec3 partWorld = (instanceMatrix * vec4(transformed, 1.0)).xyz;\n#include <part_hd>");
      }
      if (surface === -2) {
        vs = vs.replace("void main() {", `${HD_VERTEX_PARS}\n${KIT_VERTEX_PARS}\nvoid main() {`).replace("#include <part_hd>", `${HD_VERTEX}\n${KIT_VERTEX}`);
        if (organic) vs = vs.replace("#include <begin_vertex>", KIT_ORGANIC_VERTEX(idle));
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", `${defines}${HD_FRAGMENT_PARS}\n${KIT_FRAGMENT_PARS}\nvoid main() {`)
          .replace("#include <color_fragment>", KIT_FRAGMENT_COLOR)
          .replace("#include <roughnessmap_fragment>", "float roughnessFactor = clamp(kRough, 0.04, 1.0);")
          .replace("#include <metalnessmap_fragment>", "float metalnessFactor = clamp(kMetal, 0.0, 1.0);")
          .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += kEmit;")
          .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = kBump(-vViewPosition, normal, kHeight);");
      } else if (surface >= 0) {
        // An unlit part has no objectNormal: it points its normal up
        vs = vs.replace("void main() {", `${HD_VERTEX_PARS}\nvoid main() {${glow ? "\nvec3 objectNormal = vec3(0.0, 1.0, 0.0);" : ""}`).replace("#include <part_hd>", HD_VERTEX);
        shader.fragmentShader = shader.fragmentShader
          .replace("void main() {", `${defines}${HD_FRAGMENT_PARS}\nvoid main() {`)
          .replace("#include <color_fragment>", HD_FRAGMENT_COLOR);
      } else {
        vs = vs.replace("#include <part_hd>", "");
      }
      shader.vertexShader = vs;
    };
    m.customProgramCacheKey = () => `idle-parts-${glow ? 1 : 0}-${idle ? 1 : 0}-${hd ? 1 : 0}-${kit ? 1 : 0}-${surface}-${smooth ? 1 : 0}-${organic ? 1 : 0}-${fights ? 1 : 0}`;
    m.userData.idleUniforms = uniforms;
    return m;
  }, [glow, idle, hd, shape, kit, fight]);
  useEffect(() => () => material?.dispose(), [material]);
  useFrame((state) => {
    if (!material) return;
    material.userData.idleUniforms.uIdleTime.value = state.clock.elapsedTime;
    // The packs fighting now (the first fighting batch of a frame writes the shared list)
    if (idle && fight) writeFightUniform(state.clock.elapsedTime);
  });
  return material;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler(0, 0, 0, "YXZ");
const _c = new THREE.Color();
const _pq = new THREE.Quaternion();
const _pv = new THREE.Vector3();

/** Distance from the camera to what it's looking at */
export function viewDistance(state: RootState): number {
  const target = (state.controls as unknown as { target?: THREE.Vector3 } | null)?.target;
  return target ? state.camera.position.distanceTo(target) : state.camera.position.length();
}

/** `cull`: the side of a cell; a part belongs to the cell its rest place stands in */
const CULL_CELL = 16;
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _box = new THREE.Box3();

/**
 * One grid of cells for every culled batch: a cell's box holds all that any batch's parts there can reach, and which cells
 * are in view is worked out once each time the camera moves (`version` counts the changes)
 */
const cullGrid = { index: new Map<string, number>(), boxes: [] as THREE.Box3[], shown: new Uint8Array(0), version: 0, dirty: true, world: new THREE.Matrix4(), projection: new THREE.Matrix4() };

/** A batch's parts in the grid: each part's cell, and the cells the batch uses */
function cullCells(parts: Part[]) {
  const cellOf = new Int32Array(parts.length);
  const used = new Set<number>();
  parts.forEach((p, i) => {
    const key = `${Math.floor(p.x / CULL_CELL)},${Math.floor(p.z / CULL_CELL)}`;
    let c = cullGrid.index.get(key);
    if (c === undefined) {
      c = cullGrid.boxes.length;
      cullGrid.index.set(key, c);
      cullGrid.boxes.push(new THREE.Box3());
    }
    cellOf[i] = c;
    used.add(c);
    // A walker strays up to about three loop radii from its rest place; smoke and flyers rise a few units
    const reach = 0.5 * Math.hypot(p.w, p.h, p.d) + 3 * Math.max(Math.abs(p.idle?.amp ?? 0), Math.abs(p.model?.amp ?? 0)) + 4;
    cullGrid.boxes[c].union(_sphere.set(_pv.set(p.x, p.y, p.z), reach).getBoundingBox(_box));
  });
  cullGrid.dirty = true;
  return { cellOf, used: Int32Array.from(used) };
}

/** Which cells of the grid the camera sees, worked out again only when it has moved (or the grid grew) */
function cullView(camera: THREE.Camera) {
  const g = cullGrid;
  camera.updateMatrixWorld();
  if (!g.dirty && g.world.equals(camera.matrixWorld) && g.projection.equals(camera.projectionMatrix)) return;
  g.dirty = false;
  g.world.copy(camera.matrixWorld);
  g.projection.copy(camera.projectionMatrix);
  _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, _view.copy(camera.matrixWorld).invert()));
  if (g.shown.length !== g.boxes.length) g.shown = new Uint8Array(g.boxes.length);
  g.boxes.forEach((b, i) => (g.shown[i] = _frustum.intersectsBox(b) ? 1 : 0));
  g.version++;
}

/** The camera's view, worked out again only when it has moved */
const view = { frustum: new THREE.Frustum(), world: new THREE.Matrix4(), projection: new THREE.Matrix4(), set: false };
function viewFrustum(camera: THREE.Camera) {
  camera.updateMatrixWorld();
  if (!view.set || !view.world.equals(camera.matrixWorld) || !view.projection.equals(camera.projectionMatrix)) {
    view.set = true;
    view.world.copy(camera.matrixWorld);
    view.projection.copy(camera.projectionMatrix);
    view.frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, _view.copy(camera.matrixWorld).invert()));
  }
  return view.frustum;
}

/** How far a part's motion (and its HD rest pose) can take it from where it stands (a generous bound: what is in view
 * is drawn) */
function motionOf(p: Part) {
  const half = 0.5 * Math.hypot(p.w, p.h, p.d);
  let r = p.pose ? Math.hypot(p.x - p.pose.x, p.y - p.pose.y, p.z - p.pose.z) + half : 0;
  for (const c of [p.idle, p.model]) {
    if (!c) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z);
    const amp = Math.abs(c.amp ?? idleAmp(c.phase));
    // A walker strays up to about three loop radii; a puff of smoke rises and swells; a spin can take a part round to
    // the far side of its pivot; everything else turns or bends a little about its anchor
    if (c.kind >= IDLE_KIND.walk && c.kind <= IDLE_KIND.hover) r += 3 * amp + 2;
    else if (c.kind === IDLE_KIND.smoke) r += 0.7 * half + 2.2 * amp + 1;
    else if (c.kind === IDLE_KIND.spin) r += 2 * d;
    else r += d + 0.5 * half + 0.5;
  }
  return r;
}

/** `chunk`: a kit batch at least this heavy (instances × its shape's vertices) is also split into square chunks */
const CHUNK_MIN = 50000;
/** A split batch draws its chunks in view instead of itself while at most this many are in view */
const CHUNK_DRAWS = 8;

interface Chunk {
  parts: Part[];
  main: number;
  /** Holds every part of the chunk wherever its motion takes it */
  box: THREE.Box3;
}

/**
 * The shadow map is drawn once per change and must get every part, so a split batch shows all its chunks on the frame it
 * is drawn: each batch's `whole` runs when anything asks for a redraw (`shadowMap.needsUpdate = true`, from any
 * `useFrame`, before the frame renders)
 */
const shadowWatchers = new Set<() => void>();
const watchedMaps = new WeakSet<object>();
function watchShadowMap(gl: THREE.WebGLRenderer) {
  const map = gl.shadowMap;
  if (watchedMaps.has(map)) return;
  watchedMaps.add(map);
  let pending = map.needsUpdate;
  Object.defineProperty(map, "needsUpdate", {
    configurable: true,
    get: () => pending,
    set: (v: boolean) => {
      pending = v;
      if (v) shadowWatchers.forEach((f) => f());
    }
  });
}

const _r = new THREE.Matrix4();
/** The box a part fills as it stands (turned), grown by how far it moves */
function partBox(p: Part, out: THREE.Box3) {
  _r.makeRotationFromEuler(_e.set(p.rx || 0, p.ry || 0, p.rz || 0));
  const e = _r.elements;
  const m = motionOf(p);
  // Half the turned box along each world axis
  const hx = (Math.abs(e[0]) * p.w + Math.abs(e[4]) * p.h + Math.abs(e[8]) * p.d) / 2 + m;
  const hy = (Math.abs(e[1]) * p.w + Math.abs(e[5]) * p.h + Math.abs(e[9]) * p.d) / 2 + m;
  const hz = (Math.abs(e[2]) * p.w + Math.abs(e[6]) * p.h + Math.abs(e[10]) * p.d) / 2 + m;
  out.min.set(p.x - hx, p.y - hy, p.z - hz);
  out.max.set(p.x + hx, p.y + hy, p.z + hz);
  return out;
}

/** A batch's parts by square chunk of the ground (`size` across, one centred on the origin), main parts first in each;
 * parts wider than a chunk (roads, walls) share one chunk of their own, so the others stay tight */
function chunksOf(parts: Part[], main: number, size: number): Chunk[] {
  const map = new Map<string, { main: Part[]; detail: Part[] }>();
  parts.forEach((p, i) => {
    const b = partBox(p, _box);
    const key = Math.max(b.max.x - b.min.x, b.max.z - b.min.z) > size ? "far" : `${Math.floor(p.x / size + 0.5)},${Math.floor(p.z / size + 0.5)}`;
    let c = map.get(key);
    if (!c) map.set(key, (c = { main: [], detail: [] }));
    (i < main ? c.main : c.detail).push(p);
  });
  return [...map.values()].map((c) => {
    const all = [...c.main, ...c.detail];
    const box = new THREE.Box3();
    for (const p of all) box.union(partBox(p, _box));
    return { parts: all, main: c.main.length, box };
  });
}

type BatchProps = { shape: Shape; glow: boolean; parts: Part[]; main: number; detailDistance: number; shadows: boolean; hd: boolean; kit: boolean; lo?: boolean; cull?: boolean };

/** A batch's geometry: idle and model-kit batches get their own copy of the shared shape with their per-instance data */
function partGeometry(shape: Shape, kit: boolean, lo: boolean, idle: boolean, parts: Part[], fight = false) {
  const base = getShapeGeometry(shape, kit, lo);
  if (!idle && !kit) return base;
  const g = base.clone();
  if (kit) {
    // Each part's material (surface, roughness, metalness) and its model's ground
    const mat = new Float32Array(parts.length * 3);
    const ground = new Float32Array(parts.length);
    parts.forEach((p, i) => {
      const m = SURFACES[p.mat ?? "plain"];
      mat.set([m.id, m.rough, m.metal], i * 3);
      ground[i] = p.base ?? NO_BASE;
    });
    g.setAttribute("aMat", new THREE.InstancedBufferAttribute(mat, 3));
    g.setAttribute("aBase", new THREE.InstancedBufferAttribute(ground, 1));
  }
  if (!idle) return g;
  // The part's own cycle, then its model's
  const write = (cycleOf: (p: Part) => PartIdle | undefined, anchorName: string, infoName: string) => {
    const anchor = new Float32Array(parts.length * 3);
    const info = new Float32Array(parts.length * 4);
    parts.forEach((p, i) => {
      const cycle = cycleOf(p);
      anchor.set([cycle?.x ?? p.x, cycle?.y ?? p.y, cycle?.z ?? p.z], i * 3);
      // Kind 3: no idle data, the part stays still
      const ph = cycle?.phase ?? 0;
      // A small extra value rides in the kind's fraction (a wingbeat rate, a trailing part's lag)
      info.set([cycle ? cycle.kind + (cycle.sub ?? 0) : 3, ph, cycle?.speed ?? idleSpeed(ph), cycle?.amp ?? idleAmp(ph)], i * 4);
    });
    g.setAttribute(anchorName, new THREE.InstancedBufferAttribute(anchor, 3));
    g.setAttribute(infoName, new THREE.InstancedBufferAttribute(info, 4));
  };
  write((p) => p.idle, "aIdleAnchor", "aIdle");
  write((p) => p.model, "aModelAnchor", "aModel");
  // Which pack each part fights with (0: none)
  if (fight) g.setAttribute("aFight", new THREE.InstancedBufferAttribute(Float32Array.from(parts, (p) => p.fight ?? 0), 1));
  return g;
}

/** Writes each part's place and colour into a batch's instances; the first `main` cast shadows (detail never does) */
function writeParts(mesh: THREE.InstancedMesh, parts: Part[], main: number, kit: boolean) {
  parts.forEach((pt, i) => {
    _e.set(pt.rx || 0, pt.ry || 0, pt.rz || 0);
    _q.setFromEuler(_e);
    _p.set(pt.x, pt.y, pt.z);
    if (kit && pt.pose) {
      // The HD rest pose turns the part about its joint before it moves
      const o = pt.pose;
      _pq.set(o.q[0], o.q[1], o.q[2], o.q[3]);
      _p.sub(_pv.set(o.x, o.y, o.z)).applyQuaternion(_pq).add(_pv);
      _q.premultiply(_pq);
    }
    _m.compose(_p, _q, _s.set(pt.w, pt.h, pt.d));
    mesh.setMatrixAt(i, _m);
    mesh.setColorAt(i, _c.set(pt.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.count = parts.length;
  mesh.computeBoundingSphere();
  // Detail never casts a shadow: the shadow map draws only the main parts
  if (main < parts.length) {
    mesh.onBeforeShadow = () => {
      mesh.userData.drawn = mesh.count;
      mesh.count = main;
    };
    mesh.onAfterShadow = () => {
      mesh.count = mesh.userData.drawn;
    };
  }
}

/**
 * A heavy batch spread over a city, drawn whole or by chunks: zoomed in, where only a few of its chunks are in view, it
 * draws those (each chunk its own mesh, so nothing is moved or uploaded as the camera goes); with more in view it draws
 * itself whole, so its draws never grow past `CHUNK_DRAWS`. The chunks are plain meshes sharing the whole batch's
 * material, run by this one frame callback. The shadow map, drawn once, gets every main part either way
 */
function ChunkedBatch(props: BatchProps & { size: number }) {
  const { shape, glow, parts, main, size, kit, lo = false, shadows, detailDistance } = props;
  const chunks = useMemo(() => chunksOf(parts, main, size), [parts, main, size]);
  const whole = useRef<THREE.Group>(null);
  const holder = useRef<THREE.Group>(null);
  const meshes = useRef<THREE.InstancedMesh[]>([]);
  const seen = useMemo(() => new Uint8Array(chunks.length), [chunks]);
  const split = useRef(false);
  const gl = useThree((s) => s.gl);

  // The chunk meshes, made once the whole batch (and its material) is up
  useLayoutEffect(() => {
    const wholeMesh = whole.current?.children[0] as THREE.InstancedMesh | undefined;
    const group = holder.current;
    if (!wholeMesh || !group) return;
    const idle = parts.some((p) => p.idle || p.model);
    const fight = idle && parts.some((p) => p.fight);
    const made = chunks.map((c) => {
      const mesh = new THREE.InstancedMesh(partGeometry(shape, kit, lo, idle, c.parts, fight), wholeMesh.material, c.parts.length);
      writeParts(mesh, c.parts, c.main, kit);
      // The whole batch's bounds: three sorts meshes of one material by their bounds' centre, so the chunks draw in the
      // order they are made in, each in its parts' order (whether a chunk is in view is decided here, by its box)
      mesh.boundingSphere!.copy(wholeMesh.boundingSphere!);
      mesh.castShadow = wholeMesh.castShadow && c.main > 0;
      mesh.receiveShadow = wholeMesh.receiveShadow;
      mesh.visible = false;
      group.add(mesh);
      return mesh;
    });
    meshes.current = made;
    return () => {
      for (const mesh of made) {
        group.remove(mesh);
        mesh.geometry.dispose();
        mesh.dispose();
      }
      meshes.current = [];
    };
  }, [chunks, parts, shape, kit, lo, glow, shadows]);

  useEffect(() => {
    watchShadowMap(gl);
    // A shadow map about to be drawn gets every chunk
    const all = () => {
      if (split.current) for (const m of meshes.current) m.visible = m.count > 0;
    };
    shadowWatchers.add(all);
    return () => void shadowWatchers.delete(all);
  }, [gl]);

  useFrame((state) => {
    const frustum = viewFrustum(state.camera);
    let n = 0;
    chunks.forEach((c, k) => (n += seen[k] = frustum.intersectsBox(c.box) ? 1 : 0));
    split.current = n <= CHUNK_DRAWS && n < chunks.length;
    const shadowsNow = state.gl.shadowMap.needsUpdate || state.gl.shadowMap.autoUpdate;
    const near = viewDistance(state) < detailDistance;
    if (whole.current) whole.current.visible = !split.current;
    meshes.current.forEach((m, k) => {
      const c = chunks[k];
      m.count = near ? c.parts.length : c.main;
      m.visible = split.current && m.count > 0 && (shadowsNow || seen[k] === 1);
    });
  });

  return (
    <>
      <group ref={whole}>
        <PartBatch {...props} />
      </group>
      <group ref={holder} />
    </>
  );
}

/** `main`: how many of `parts` come first and are always drawn; the rest are detail, drawn only within `detailDistance`
 * and kept out of the shadow map. `cull` (parts spread over the map, no detail): only the cells in view are drawn */
function PartBatch({ shape, glow, parts, main, detailDistance, shadows, hd, kit, lo = false, cull = false }: BatchProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const cells = useMemo(() => (cull && main === parts.length ? cullCells(parts) : null), [cull, main, parts]);
  // The instances as written (every attribute in the parts' order), which of its cells were in view at the last reorder
  // and the grid's version it last looked at
  const culled = useRef<{ sources: THREE.BufferAttribute[]; copies: Float32Array[]; shown: Uint8Array | null; next: Uint8Array; order: Int32Array; version: number } | null>(null);
  const idle = useMemo(() => parts.some((p) => p.idle || p.model), [parts]);
  // A batch holding a pack's creatures strikes with them (mobs and bandits on the map)
  const fight = useMemo(() => idle && parts.some((p) => p.fight), [idle, parts]);
  const idleMaterial = usePartMaterial(glow, idle, hd, shape, kit, fight);
  const geometry = useMemo(() => partGeometry(shape, kit, lo, idle, parts, fight), [shape, idle, parts, kit, lo, fight]);
  useEffect(() => () => {
    if (geometry !== getShapeGeometry(shape, kit, lo)) geometry.dispose();
  }, [geometry, shape, kit, lo]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    // Culled instances were reordered: put every attribute back in the parts' order before the instances are written again
    culled.current?.sources.forEach((a, k) => {
      (a.array as Float32Array).set(culled.current!.copies[k]);
      a.needsUpdate = true;
    });
    culled.current = null;
    writeParts(mesh, parts, main, kit);
    if (cells) {
      const sources = [mesh.instanceMatrix, ...(mesh.instanceColor ? [mesh.instanceColor] : []), ...Object.values(mesh.geometry.attributes).filter((a): a is THREE.InstancedBufferAttribute => (a as THREE.InstancedBufferAttribute).isInstancedBufferAttribute)];
      culled.current = { sources, copies: sources.map((a) => (a.array as Float32Array).slice()), shown: null, next: new Uint8Array(cells.used.length), order: new Int32Array(parts.length), version: -1 };
      // Culled instances are only moved to the end, so the shadow map (drawn once) still gets every part
      mesh.onBeforeShadow = () => {
        mesh.userData.drawn = mesh.count;
        mesh.count = parts.length;
      };
      mesh.onAfterShadow = () => {
        mesh.count = mesh.userData.drawn;
      };
    }
    // A new material (switching HD) rebuilds the mesh, so its instances are written again
  }, [parts, main, geometry, idleMaterial, kit, cells]);

  // Culling: when the cells in view change, the instances in them move to the front in their own order (so what is drawn
  // is drawn exactly as before) and only they are drawn; the rest follow, for the shadow map
  useFrame((state) => {
    const mesh = ref.current;
    const c = culled.current;
    if (!mesh || !cells || !c) return;
    cullView(state.camera);
    if (c.version === cullGrid.version) return;
    c.version = cullGrid.version;
    const grid = cullGrid.shown;
    const mine = c.next;
    let same = c.shown !== null;
    cells.used.forEach((cell, k) => {
      mine[k] = grid[cell];
      if (c.shown && c.shown[k] !== mine[k]) same = false;
    });
    if (same) return;
    c.next = c.shown ?? new Uint8Array(mine.length);
    c.shown = mine;
    let at = 0;
    const order = c.order;
    for (let pass = 1; pass >= 0; pass--) for (let i = 0; i < parts.length; i++) if (grid[cells.cellOf[i]] === pass) order[at++] = i;
    c.sources.forEach((a, k) => {
      const src = c.copies[k];
      const dst = a.array as Float32Array;
      const n = a.itemSize;
      for (let j = 0; j < order.length; j++) for (let e = 0, s = order[j] * n, d = j * n; e < n; e++) dst[d + e] = src[s + e];
      a.needsUpdate = true;
    });
    let drawn = 0;
    for (let i = 0; i < parts.length; i++) drawn += grid[cells.cellOf[i]];
    // No cell in view: no instances, so no draw (the mesh stays visible for the shadow map)
    mesh.count = drawn;
  });

  // Detail shows only up close: zoomed out the batch draws its main parts alone
  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh || main === parts.length || detailDistance === Infinity) return;
    mesh.count = viewDistance(state) < detailDistance ? parts.length : main;
    mesh.visible = mesh.count > 0;
  });

  // Windows and lamps follow the hour: dimmer by day, bright at night
  useEffect(() => {
    const m = ref.current?.material;
    if (glow && m instanceof THREE.MeshBasicMaterial) return registerGlowMaterial(m);
  }, [glow, idleMaterial]);

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, idleMaterial ?? undefined, parts.length]}
      castShadow={shadows && !glow && main > 0}
      receiveShadow={!glow}
    >
      {!idleMaterial && (glow ? <meshBasicMaterial toneMapped={false} /> : <meshStandardMaterial roughness={0.85} flatShading />)}
    </instancedMesh>
  );
}

/** A box much longer than it is thick (a city wall, a road, a kerb): its HD bevel would stretch along it, so in a tagged
 * scene it stays a plain box (`slab`) */
const stretched = (p: Part) => p.shape === "box" && Math.max(p.w, p.h, p.d) > 6 * Math.min(p.w, p.h, p.d);

/**
 * Draws any number of parts with one InstancedMesh per (shape, lit/unlit) pair. Smoke puffs, walking creatures and
 * turning or orbiting parts leave their rest pose, so they get a batch of their own that casts no shadow (the shadow
 * map is drawn once). `hd` adds each shape's surface detail and lets swaying trees bend with the wind's gusts.
 * `kit`: the HD model kit (bevelled shapes, `hdShape`, HD-only parts, rest poses, materials, no Normal-only parts);
 * without it HD-only parts are left out and the rest is drawn exactly as always. `kit="tagged"`: only parts tagged
 * `kit` (a city's improvements) take their HD version, the rest of the scene as always; their glows stay plain, so they
 * share the scene's glow batches.
 * `detail`: small props (flowers, crates, carts) drawn in the same batches as `parts` (no extra draw for a shape both
 * use), only while the camera is within `detailDistance` of what it looks at, and never casting shadows.
 * `cull`: for parts spread over the whole map (its NPCs): each batch draws only the instances in the cells the camera sees.
 * `chunk`: for a whole city in HD: its heaviest kit batches are also split into chunks this size across, drawn instead
 * while only a few of them are in view (`ChunkedBatch`).
 */
export function InstancedParts({ parts, detail, detailDistance = Infinity, shadows = true, hd = false, kit = false, cull = false, chunk }: { parts: Part[]; detail?: Part[]; detailDistance?: number; shadows?: boolean; hd?: boolean; kit?: boolean | "tagged"; cull?: boolean; chunk?: number }) {
  const batches = useMemo(() => {
    const map = new Map<string, { shape: Shape; glow: boolean; drifts: boolean; kit: boolean; lo: boolean; parts: Part[]; detail: Part[] }>();
    const all = detail ? [...parts, ...detail] : parts;
    all.forEach((p, i) => {
      const isDetail = i >= parts.length;
      const kitOn = kit === true || (kit === "tagged" && !!p.kit);
      // HD-only parts (hd: true) and the Normal-only parts they replace (hd: false)
      if (p.hd === !kitOn) return;
      // Smoke keeps its soft faceted puffs in HD (a smooth lit ball reads as a stone in the air)
      // In a tagged scene glows stay plain (they share the scene's glow batches)
      const kitPart = kitOn && p.idle?.kind !== IDLE_KIND.smoke && !(kit === "tagged" && p.glow);
      const shape = kitPart ? (p.hdShape ?? (kit === "tagged" && stretched(p) ? "slab" : p.shape)) : p.shape;
      // Turning and orbiting parts move too (a vane, birds circling); glowing ones never cast shadows anyway
      const drifts = p.idle?.kind === IDLE_KIND.smoke || walks(p) || (p.idle?.kind === IDLE_KIND.spin && !p.glow);
      // Small and thin kit parts take the lighter HD twin
      const lo = kitPart && hdLo(shape, p);
      const key = `${shape}|${p.glow ? 1 : 0}|${drifts ? 1 : 0}|${kitPart ? 1 : 0}|${lo ? 1 : 0}`;
      let batch = map.get(key);
      if (!batch) {
        batch = { shape, glow: !!p.glow, drifts, kit: kitPart, lo, parts: [], detail: [] };
        map.set(key, batch);
      }
      (isDetail ? batch.detail : batch.parts).push(p);
    });
    // Main parts first, then the detail (cut off by the instance count when zoomed out)
    return [...map.entries()].map(([key, b]) => {
      const all = [...b.parts, ...b.detail];
      const heavy = !!chunk && b.kit && all.length * getShapeGeometry(b.shape, true, b.lo).getAttribute("position").count >= CHUNK_MIN;
      return { key, ...b, main: b.parts.length, parts: all, heavy };
    });
  }, [parts, detail, kit, chunk]);

  return (
    <>
      {batches.map((b) => {
        const props: BatchProps = { shape: b.shape, glow: b.glow, parts: b.parts, main: b.main, detailDistance, shadows: shadows && !b.drifts, hd, kit: b.kit, lo: b.lo, cull };
        // Instance count is fixed at creation, so remount when it changes
        const key = `${b.key}-${b.parts.length}`;
        return b.heavy ? <ChunkedBatch key={key} {...props} size={chunk!} /> : <PartBatch key={key} {...props} />;
      })}
    </>
  );
}
