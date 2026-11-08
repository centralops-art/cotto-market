import type { BottomTabBarButtonProps } from "expo-router/build/react-navigation/bottom-tabs";
import { Pressable, Text, View } from "react-native";

/** Brand accent for the active tab's cup outline -- same as tabBarActiveTintColor
 * used elsewhere in the app. */
const ACTIVE_ACCENT = "#D96A3E";

type Props = BottomTabBarButtonProps & {
  /** Alternating red/cream per button, same hex values as the scalloped
   * awning strip on cottomarket.com -- see tailwind.config.js's `awning`
   * tokens. Assigned per screen in (tabs)/_layout.tsx rather than computed
   * from position, so hiding a tab (href: null) can't shift another tab's
   * color at runtime. */
  cupColor: "red" | "cream";
  label: string;
  /** false hides the button (renders nothing, so the flex row closes the gap)
   * while leaving the route itself navigable -- expo-router won't let a
   * screen combine a custom tabBarButton with `href`, which is how this
   * project previously hid role-gated tabs (Kitchen/Deliveries). Defaults
   * to true. */
  visible?: boolean;
};

/** Bottom-tab button colored like one stripe of the site's awning (same
 * motif as the website's scalloped nav strip -- see HANDOFF.md for the CSS
 * this was read off of), prioritizing readable label text over the dome
 * shape: a slim rounded rectangle, nearly edge-to-edge, so longer labels
 * ("Favorites", "Deliveries") get as much width as possible. Renders its
 * own label (ignoring `children`, the default react-navigation label) so
 * each button's text color can be chosen for contrast against red vs.
 * cream. */
export function AwningTabButton({
  cupColor,
  label,
  visible = true,
  accessibilityState,
  style,
  onPress,
  children: _children,
  ref: _ref,
  ...rest
}: Props) {
  if (!visible) return null;

  const isActive = !!accessibilityState?.selected;
  const isRed = cupColor === "red";

  return (
    <Pressable
      {...rest}
      onPress={onPress}
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
      style={style}
      className="flex-1 items-center justify-center bg-awning-brown px-0.5 py-1.5"
    >
      <View
        className={`h-full w-full items-center justify-center rounded-md ${isRed ? "bg-awning-red" : "bg-awning-cream"} ${
          isActive ? "border-2" : ""
        }`}
        style={isActive ? { borderColor: ACTIVE_ACCENT } : undefined}
      >
        <Text
          className={`text-center text-[10px] font-bold leading-tight ${isRed ? "text-awning-cream" : "text-awning-brown"} ${
            isActive ? "" : "opacity-70"
          }`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
