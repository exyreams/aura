import { motion, type Variants } from "motion/react";
import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type ClockProps = IconProps<keyof typeof animations>;
const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    circle: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    hands: {
      initial: { pathLength: 0, opacity: 0 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "easeOut", delay: 0.3 },
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
        <motion.path
          d="M12 6v6l4 2"
          variants={variants.hands}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          variants={variants.circle}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}
function Clock(props: ClockProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Clock,
  Clock as ClockIcon,
  type ClockProps,
  type ClockProps as ClockIconProps,
};
