"use client";

import { useEffect, useRef } from "react";

/**
 * Login-page backdrop: a slowly flowing liquid surface (domain-warped noise lit as a
 * height field), tinted with the theme's emerald/teal on near-black. Plain WebGL 1,
 * no dependencies. Renders at reduced resolution, pauses when the tab is hidden, and
 * shows a single still frame when the user prefers reduced motion.
 */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_tilt;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// Liquid height: two levels of domain warping give the slow, folding "water" motion.
float height(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.07)), fbm(p + vec2(5.2, 1.3) - t * 0.05));
  vec2 r = vec2(fbm(p + 2.6 * q + vec2(1.7, 9.2) + t * 0.08), fbm(p + 2.6 * q + vec2(8.3, 2.8) - t * 0.06));
  return fbm(p + 2.4 * r);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  p = p * 1.7 + u_tilt * 0.12;           // parallax toward the pointer
  float t = u_time * 0.5;                // half speed: slow, calm flow

  float e = 0.012;
  float h = height(p, t);
  float hx = height(p + vec2(e, 0.0), t);
  float hy = height(p + vec2(0.0, e), t);
  vec3 n = normalize(vec3((h - hx) / e * 0.55, (h - hy) / e * 0.55, 1.0));

  vec3 L = normalize(vec3(-0.45 + u_tilt.x * 0.3, 0.55 + u_tilt.y * 0.3, 0.75));
  float diff = clamp(dot(n, L), 0.0, 1.0);
  float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 36.0);
  float fres = pow(1.0 - n.z, 2.0);

  vec3 bg      = vec3(0.035, 0.043, 0.058);   // near-black, cool
  vec3 deep    = vec3(0.030, 0.230, 0.175);   // deep emerald
  vec3 emerald = vec3(0.204, 0.827, 0.600);
  vec3 teal    = vec3(0.078, 0.722, 0.651);

  vec3 col = mix(bg, deep, smoothstep(0.20, 0.85, h));
  col += mix(teal, emerald, h) * diff * 0.18;
  col += emerald * spec * 0.85;
  col += teal * fres * 0.55;

  // Calm the centre (where the card sits) a little and fade softly at the edges.
  float centre = smoothstep(0.0, 0.55, length((uv - 0.5) * vec2(u_res.x / u_res.y, 1.0)));
  col *= mix(0.72, 1.0, centre);
  float vig = 1.0 - smoothstep(0.45, 1.45, length(uv - 0.5) * 1.4);
  col *= vig;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

export function LiquidBackground({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
    if (!gl) return; // CSS gradient behind the canvas stays as the fallback

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "u_res");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uTilt = gl.getUniformLocation(prog, "u_tilt");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const SCALE = 0.5; // render at half resolution; the liquid is soft, CSS upscales smoothly

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * SCALE));
      const h = Math.max(1, Math.floor(canvas.clientHeight * SCALE));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    };

    const target = { x: 0, y: 0 };
    const tilt = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };

    let raf = 0;
    const start = performance.now();
    const frame = (now: number) => {
      resize();
      tilt.x += (target.x - tilt.x) * 0.04;
      tilt.y += (target.y - tilt.y) * 0.04;
      gl.uniform1f(uTime, reduced ? 8 : (now - start) / 1000);
      gl.uniform2f(uTilt, tilt.x, tilt.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduced && !document.hidden) raf = requestAnimationFrame(frame);
    };
    const onVisibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduced) raf = requestAnimationFrame(frame);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", resize);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", resize);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <div aria-hidden className={className} style={{ background: "radial-gradient(60% 50% at 30% 20%, rgba(16,120,90,0.25), transparent 70%), radial-gradient(50% 50% at 80% 80%, rgba(20,184,166,0.15), transparent 70%), #090b0f" }}>
      <canvas ref={ref} className="block size-full" />
    </div>
  );
}
