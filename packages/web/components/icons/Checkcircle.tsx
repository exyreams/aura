import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type CheckcircleProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        rotate: 0,
        scale: 1,
      },
      animate: {
        transition: {
          duration: 0.5,
        },
      },
    },
    outerCircle: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.5,
          ease: "easeInOut",
        },
      },
    },
    checkMark: {
      initial: {
        scale: 1,
        opacity: 1,
      },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.2,
          ease: "easeOut",
          delay: 0.15,
        },
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
        <motion.circle
          cx="12"
          cy="12"
          r="10"
          variants={variants.outerCircle}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m9 12 2 2 4-4"
          variants={variants.checkMark}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function Checkcircle(props: CheckcircleProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Checkcircle,
  Checkcircle as CheckcircleIcon,
  type CheckcircleProps,
  type CheckcircleProps as CheckcircleIconProps,
};
