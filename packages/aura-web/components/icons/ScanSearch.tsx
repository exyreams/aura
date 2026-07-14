import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type ScanSearchProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    corners: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.6, ease: "easeInOut" },
      },
    },
    circle: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "easeOut", delay: 0.3 },
      },
    },
    searchLine: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.5 },
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
          d="M3 7V5a2 2 0 0 1 2-2h2"
          variants={variants.corners}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M17 3h2a2 2 0 0 1 2 2v2"
          variants={variants.corners}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M21 17v2a2 2 0 0 1-2 2h-2"
          variants={variants.corners}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M7 21H5a2 2 0 0 1-2-2v-2"
          variants={variants.corners}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="3"
          variants={variants.circle}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m16 16-1.9-1.9"
          variants={variants.searchLine}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function ScanSearch(props: ScanSearchProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ScanSearch,
  ScanSearch as ScanSearchIcon,
  type ScanSearchProps,
  type ScanSearchProps as ScanSearchIconProps,
};
