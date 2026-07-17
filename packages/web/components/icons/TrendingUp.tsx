import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type TrendingUpProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    arrow: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "easeOut" },
      },
    },
    trendLine: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.6, ease: "easeInOut", delay: 0.2 },
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
        {/* Arrow head */}
        <motion.path
          d="M16 7h6v6"
          variants={variants.arrow}
          initial="initial"
          animate={controls}
        />

        {/* Trend line */}
        <motion.path
          d="m22 7-8.5 8.5-5-5L2 17"
          variants={variants.trendLine}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function TrendingUp(props: TrendingUpProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  TrendingUp,
  TrendingUp as TrendingUpIcon,
  type TrendingUpProps,
  type TrendingUpProps as TrendingUpIconProps,
};
