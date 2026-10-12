// The Zorka tiger. Traced from the mascot artwork (tigerPaths.generated.ts) and drawn in layers so it reads as a 3D
// token: an extruded edge, a bevel under the face, top-lit shading, a glossy highlight that slides as the head tilts, and
// a ground shadow. The eyes are live: pupils move (eye-roll), lids drop (blink, happy squint).
//
// Reactions: blink · eyeroll · happy · cheer · wiggle. They play on tap (the head also tilts toward your finger),
// from `playOnMount`, or from anywhere in the app via reactMascot() (bus.ts). Idle: slow breathing and a blink every few
// seconds. `still` draws it static (share-card captures, the logo). Nothing moves when the OS reduces motion.
import { useCallback, useEffect, useId, useRef } from "react";
import { Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from "react-native-svg";

import { haptics } from "@/core/haptics";
import { FRESH_MS, useMascotBus, type MascotReaction } from "./bus";
import { BOX, EARS, EYES, FACE, MUZZLE, NOSE, SILHOUETTE, VIEWBOX } from "./tigerPaths.generated";

const AEllipse = Animated.createAnimatedComponent(Ellipse);

/** Artwork colours (sampled from the mascot PNG; the mascot is brand art, so it doesn't follow the theme). */
const ART = {
  ink: "#151619",
  edge: "#050607",
  lime: "#D8ED62",
  limeShade: "#9DB23A",
  cream: "#F9F4EB",
  creamShade: "#DED3BF",
  lilac: "#B49EFB",
} as const;

export const MASCOT_RATIO = BOX.h / BOX.w;
const EXTRUDE = 26;

type Eye = (typeof EYES)[number];

type Props = {
  /** Width in px; height follows the artwork (~0.83×), plus room for the shadow. */
  size: number;
  /** Static drawing: no idle motion, no reactions, no shadow animation. */
  still?: boolean;
  /** Tap to react (default true unless `still`). */
  interactive?: boolean;
  /** React to reactMascot() calls (default true unless `still`). */
  listen?: boolean;
  /** Played shortly after mounting, e.g. "cheer" on the celebration screen. */
  playOnMount?: MascotReaction;
  /** Eyes up and to the side while true (e.g. the coach is typing). */
  thinking?: boolean;
  /** Ground shadow under the head (default true). */
  shadow?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Mascot({
  size,
  still = false,
  interactive = !still,
  listen = !still,
  playOnMount,
  thinking = false,
  shadow = true,
  style,
  accessibilityLabel = "Zorka tiger",
}: Props) {
  const reduced = useReducedMotion();
  const animate = !still && !reduced;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const height = size * MASCOT_RATIO;
  const shadowH = shadow ? size * 0.1 : 0;

  // Head motion.
  const lift = useSharedValue(0); // fraction of size, negative = up
  const tiltX = useSharedValue(0);
  const tiltY = useSharedValue(0);
  const rot = useSharedValue(0);
  const squash = useSharedValue(0); // +1 squashed, −1 stretched
  const pop = useSharedValue(1);
  const press = useSharedValue(1);
  const breath = useSharedValue(0);
  // Eyes.
  const px = useSharedValue(0); // −1..1 within the socket
  const py = useSharedValue(0);
  const ps = useSharedValue(1); // pupil scale; 1 fills the socket (the artwork's look)
  const lid = useSharedValue(0); // 0 open, 1 closed

  const busyUntil = useRef(0);

  const play = useCallback(
    (kind: MascotReaction) => {
      if (!animate) return;
      const t = (v: number, ms: number, easing = Easing.inOut(Easing.quad)) => withTiming(v, { duration: ms, easing });
      const spring = (v: number) => withSpring(v, { damping: 9, stiffness: 160 });
      const now = Date.now();
      switch (kind) {
        case "blink":
          lid.set(withSequence(t(1, 70), t(0, 110)));
          busyUntil.current = now + 200;
          break;
        case "eyeroll":
          // Half-lidded, pupils shrink and sweep left → up → right, hold, then back with a little sigh (slump).
          ps.set(withSequence(t(0.6, 160), withDelay(1060, t(1, 220))));
          lid.set(withSequence(t(0.36, 160), withDelay(1040, t(0, 220))));
          px.set(withSequence(t(-0.8, 180), t(-0.85, 200), t(0, 220), t(0.85, 220), withDelay(380, t(0, 240))));
          py.set(withSequence(t(0.25, 180), t(-0.6, 200), t(-1, 220), t(-0.6, 220), withDelay(380, t(0, 240))));
          tiltX.set(withSequence(t(0, 180), t(12, 420), withDelay(420, spring(0))));
          rot.set(withSequence(withDelay(200, t(-7, 400)), withDelay(380, spring(0))));
          squash.set(withDelay(1250, withSequence(t(0.8, 140), spring(0))));
          busyUntil.current = now + 1700;
          break;
        case "happy":
          lift.set(
            withSequence(
              t(-0.12, 180, Easing.out(Easing.quad)),
              t(0, 200, Easing.in(Easing.quad)),
              t(-0.05, 140, Easing.out(Easing.quad)),
              t(0, 140, Easing.in(Easing.quad)),
            ),
          );
          squash.set(withSequence(t(-1, 180), t(0, 160), t(1, 80), spring(0)));
          lid.set(withSequence(t(0.45, 150), withDelay(520, t(0, 200))));
          rot.set(withSequence(t(-4, 180), t(4, 220), spring(0)));
          busyUntil.current = now + 950;
          break;
        case "cheer":
          pop.set(withSequence(spring(1.12), withDelay(900, spring(1))));
          lift.set(
            withSequence(
              t(-0.18, 220, Easing.out(Easing.quad)),
              t(0, 220, Easing.in(Easing.quad)),
              t(-0.14, 200, Easing.out(Easing.quad)),
              t(0, 200, Easing.in(Easing.quad)),
            ),
          );
          squash.set(withSequence(t(-1, 220), t(1, 220), t(-0.8, 200), t(1, 200), spring(0)));
          rot.set(withSequence(t(-10, 150), t(10, 200), t(-8, 200), t(6, 200), spring(0)));
          lid.set(withSequence(t(0.5, 200), withDelay(700, t(0, 200)), withDelay(200, t(1, 70)), t(0, 110)));
          busyUntil.current = now + 1600;
          break;
        case "wiggle":
          rot.set(withSequence(t(-9, 100), t(9, 140), t(-7, 140), t(5, 140), spring(0)));
          tiltY.set(withSequence(t(-15, 140), t(15, 220), spring(0)));
          busyUntil.current = now + 800;
          break;
      }
    },
    [animate, lid, ps, px, py, tiltX, tiltY, rot, squash, lift, pop],
  );

  // Idle: breathing + random blinks.
  useEffect(() => {
    if (!animate) return;
    breath.set(withRepeat(withTiming(1, { duration: 1900, easing: Easing.inOut(Easing.sin) }), -1, true));
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(
        () => {
          if (Date.now() > busyUntil.current) play("blink");
          next();
        },
        2800 + Math.random() * 3200,
      );
    };
    next();
    return () => clearTimeout(timer);
  }, [animate, breath, play]);

  useEffect(() => {
    if (!playOnMount || !animate) return;
    const timer = setTimeout(() => play(playOnMount), 280);
    return () => clearTimeout(timer);
  }, [playOnMount, animate, play]);

  useEffect(() => {
    if (!listen || !animate) return;
    const recent = useMascotBus.getState().last;
    const timer = recent && Date.now() - recent.at < FRESH_MS ? setTimeout(() => play(recent.kind), 320) : undefined;
    const unsub = useMascotBus.subscribe((s, prev) => {
      if (s.last && s.last.id !== prev.last?.id) play(s.last.kind);
    });
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [listen, animate, play]);

  useEffect(() => {
    if (!animate) return;
    const t = (v: number) => withTiming(v, { duration: 260, easing: Easing.inOut(Easing.quad) });
    px.set(t(thinking ? 0.55 : 0));
    py.set(t(thinking ? -0.75 : 0));
    ps.set(t(thinking ? 0.7 : 1));
  }, [thinking, animate, px, py, ps]);

  const onPressIn = (e: GestureResponderEvent) => {
    if (!animate) return;
    const { locationX, locationY } = e.nativeEvent;
    tiltY.set(withSpring((locationX / size - 0.5) * 30));
    tiltX.set(withSpring(-(locationY / height - 0.5) * 30));
    press.set(withTiming(0.94, { duration: 120 }));
  };
  const onPressOut = () => {
    tiltY.set(withSpring(0, { damping: 8 }));
    tiltX.set(withSpring(0, { damping: 8 }));
    press.set(withSpring(1, { damping: 7 }));
  };
  const onPress = () => {
    haptics.tap();
    const pick: MascotReaction[] = ["eyeroll", "eyeroll", "wiggle", "happy", "blink"];
    play(pick[Math.floor(Math.random() * pick.length)]!);
  };

  const headStyle = useAnimatedStyle(() => {
    const b = 1 + breath.value * 0.015;
    const s = press.value * pop.value * b;
    return {
      transform: [
        { perspective: 700 },
        { translateY: lift.value * size - breath.value * size * 0.01 },
        { rotateX: `${tiltX.value}deg` },
        { rotateY: `${tiltY.value}deg` },
        { rotateZ: `${rot.value}deg` },
        { scaleX: s * (1 + squash.value * 0.07) },
        { scaleY: s * (1 - squash.value * 0.07) },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 0.85 + lift.value * 2.5,
    transform: [{ scaleX: 1 + lift.value * 1.4 + squash.value * 0.06 }, { scaleY: 1 + lift.value }],
  }));

  // The highlight slides opposite the tilt, so the light feels fixed while the head turns.
  const shine = useAnimatedProps(() => ({
    cx: BOX.x + BOX.w * 0.36 - tiltY.value * 9,
    cy: BOX.y + BOX.h * 0.3 + tiltX.value * 7,
  }));

  const body = (
    <View style={{ width: size, height: height + shadowH }}>
      {shadow ? (
        <Animated.View
          style={[styles.shadow, { top: height - shadowH * 0.9, height: shadowH * 1.6 }, still ? null : shadowStyle]}
        >
          <Svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
            <Defs>
              <RadialGradient id={`gs${uid}`} cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor="#000" stopOpacity={0.5} />
                <Stop offset="1" stopColor="#000" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse cx={50} cy={10} rx={50} ry={10} fill={`url(#gs${uid})`} />
          </Svg>
        </Animated.View>
      ) : null}
      <Animated.View style={[{ width: size, height }, still ? null : headStyle]}>
        <Svg width={size} height={height} viewBox={VIEWBOX}>
          <Defs>
            <LinearGradient id={`shade${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.24} />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.75" stopColor="#000000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000000" stopOpacity={0.26} />
            </LinearGradient>
            <LinearGradient id={`muz${uid}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ART.cream} />
              <Stop offset="1" stopColor={ART.creamShade} />
            </LinearGradient>
            <RadialGradient id={`shine${uid}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.42} />
              <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
            <ClipPath id={`sil${uid}`}>
              <Path d={SILHOUETTE} />
            </ClipPath>
            <ClipPath id={`face${uid}`}>
              <Path d={FACE} clipRule="evenodd" />
            </ClipPath>
            {EYES.map((eye, i) => (
              <ClipPath key={i} id={`eye${i}${uid}`}>
                <Path d={eye.path} />
              </ClipPath>
            ))}
          </Defs>

          {/* Extruded edge, then the outline on top of it. */}
          <G transform={`translate(0 ${EXTRUDE})`}>
            <Path d={SILHOUETTE} fill={ART.edge} />
          </G>
          <Path d={SILHOUETTE} fill={ART.ink} />
          {/* Bevel: a darker lime rim under the face and the stripes (reads as carved-in). */}
          <G clipPath={`url(#sil${uid})`}>
            <G transform="translate(0 12)">
              <Path d={FACE} fill={ART.limeShade} fillRule="evenodd" />
            </G>
          </G>

          <Path d={FACE} fill={ART.lime} fillRule="evenodd" />
          <Path d={FACE} fill={`url(#shade${uid})`} fillRule="evenodd" />
          <Path d={EARS} fill={ART.lilac} fillRule="evenodd" />
          <Path d={MUZZLE} fill={`url(#muz${uid})`} fillRule="evenodd" />

          {EYES.map((eye, i) => (
            <AnimatedEye key={i} eye={eye} side={i === 0 ? 1 : -1} clip={`eye${i}${uid}`} {...{ px, py, ps, lid }} />
          ))}

          {/* Gloss on the nose, and the sliding face highlight. */}
          <Ellipse cx={NOSE.cx - 28} cy={NOSE.cy - 14} rx={40} ry={13} fill="#FFFFFF" opacity={0.45} />
          <G clipPath={`url(#face${uid})`}>
            {still ? (
              <Ellipse
                cx={BOX.x + BOX.w * 0.36}
                cy={BOX.y + BOX.h * 0.3}
                rx={BOX.w * 0.34}
                ry={BOX.h * 0.26}
                fill={`url(#shine${uid})`}
              />
            ) : (
              <AEllipse animatedProps={shine} rx={BOX.w * 0.34} ry={BOX.h * 0.26} fill={`url(#shine${uid})`} />
            )}
          </G>
        </Svg>
      </Animated.View>
    </View>
  );

  if (!interactive || !animate) {
    return (
      <View style={style} accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      style={style}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Plays an animation"
    >
      {body}
    </Pressable>
  );
}

function AnimatedEye({
  eye,
  side,
  clip,
  px,
  py,
  ps,
  lid,
}: {
  eye: Eye;
  side: 1 | -1;
  clip: string;
  px: SharedValue<number>;
  py: SharedValue<number>;
  ps: SharedValue<number>;
  lid: SharedValue<number>;
}) {
  const pupil = useAnimatedProps(() => {
    const s = ps.value;
    return {
      cx: eye.cx + px.value * eye.rx * (1 - s),
      cy: eye.cy + py.value * eye.ry * (1 - s),
      rx: eye.rx * s * 1.05 + 3,
      ry: eye.ry * s * 1.05 + 3,
    };
  });
  // Catch-light sits up and toward the nose, like the artwork, and rides with the pupil.
  const glint = useAnimatedProps(() => {
    const s = ps.value;
    return {
      cx: eye.cx + px.value * eye.rx * (1 - s) + side * eye.rx * 0.14 * s,
      cy: eye.cy + py.value * eye.ry * (1 - s) - eye.ry * 0.28 * s,
      rx: eye.rx * 0.32 * s,
      ry: eye.rx * 0.32 * s,
    };
  });
  const lidProps = useAnimatedProps(() => ({ cy: eye.cy - 2.1 * eye.ry + lid.value * 2.15 * eye.ry }));
  return (
    <>
      <G clipPath={`url(#${clip})`}>
        <Path d={eye.path} fill={ART.cream} />
        <AEllipse animatedProps={pupil} fill={ART.ink} />
        <AEllipse animatedProps={glint} fill={ART.cream} />
        <AEllipse
          animatedProps={lidProps}
          cx={eye.cx}
          rx={eye.rx * 1.7}
          ry={eye.ry * 1.1}
          fill={ART.lime}
          stroke={ART.ink}
          strokeWidth={12}
        />
      </G>
      <Path d={eye.path} fill="none" stroke={ART.ink} strokeWidth={6} />
    </>
  );
}

const styles = StyleSheet.create({
  shadow: { position: "absolute", left: "12%", right: "12%" },
});
