import { useEffect, useRef, useState } from "react";
import { Keyboard, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from "react-native";

/** Keeps the focused text field above the keyboard on a full-page ScrollView.
 *
 * While the keyboard is open it reports the keyboard's height (add it to the
 * ScrollView's bottom padding so there is room to scroll), and once that
 * padding is in place it scrolls just far enough that the focused field sits
 * `margin` px above the keyboard. Pure JS, so it works on the dev client and
 * existing builds without a native rebuild, and it doesn't depend on Android's
 * window-resize behavior (which edge-to-edge apps no longer get). */
export function useKeyboardAwareScroll(margin = 24) {
  const scrollRef = useRef<ScrollView>(null);
  const offsetY = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    let timer: ReturnType<typeof setTimeout> | undefined;

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      setKeyboardHeight(e.endCoordinates.height);
      clearTimeout(timer);
      // Give the new bottom padding a moment to render so there's room to scroll.
      timer = setTimeout(() => {
        const input = TextInput.State.currentlyFocusedInput();
        if (!input) return;
        input.measureInWindow((_x, y, _w, h) => {
          const overlap = y + h + margin - keyboardTop;
          if (overlap > 0) scrollRef.current?.scrollTo({ y: offsetY.current + overlap, animated: true });
        });
      }, 100);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      clearTimeout(timer);
      showSub.remove();
      hideSub.remove();
    };
  }, [margin]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
  };

  return { scrollRef, keyboardHeight, onScroll };
}
