import { motion, type Variants } from "motion/react";
import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type PauseProps = IconProps<keyof typeof animations>;
const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    leftBar: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "backOut" },
      },
    },
    rightBar: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "backOut", delay: 0.2 },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({
  size,
  "aria-label": ariaLabel,
  ...props
}: IconProps<string>) {
  const { controls } = useAnimationWrapperContext();
  const variants = useVariants(animations);
  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      role={ariaLabel ? "img" : "presentation"}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      <motion.g variants={variants.group} initial="initial" animate={controls}>
        <motion.rect
          x="14"
          y="3"
          width="5"
          height="18"
          rx="1"
          variants={variants.rightBar}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          x="5"
          y="3"
          width="5"
          height="18"
          rx="1"
          variants={variants.leftBar}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}
function Pause(props: PauseProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Pause,
  Pause as PauseIcon,
  type PauseProps,
  type PauseProps as PauseIconProps,
};
