import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type SquareArrowOutUpRightProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    square: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    arrow: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.3 },
      },
    },
    arrowhead: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.4 },
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
          d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"
          variants={variants.square}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m21 3-9 9"
          variants={variants.arrow}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M15 3h6v6"
          variants={variants.arrowhead}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function SquareArrowOutUpRight(props: SquareArrowOutUpRightProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  SquareArrowOutUpRight,
  SquareArrowOutUpRight as SquareArrowOutUpRightIcon,
  type SquareArrowOutUpRightProps,
  type SquareArrowOutUpRightProps as SquareArrowOutUpRightIconProps,
};
