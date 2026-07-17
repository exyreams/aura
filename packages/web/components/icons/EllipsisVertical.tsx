import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type EllipsisVerticalProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    dot1: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [1, 1.6, 1],
        opacity: [1, 0.6, 1],
        transition: { duration: 0.4, ease: "easeInOut", delay: 0 },
      },
    },
    dot2: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [1, 1.6, 1],
        opacity: [1, 0.6, 1],
        transition: { duration: 0.4, ease: "easeInOut", delay: 0.08 },
      },
    },
    dot3: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [1, 1.6, 1],
        opacity: [1, 0.6, 1],
        transition: { duration: 0.4, ease: "easeInOut", delay: 0.16 },
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
          cy="5"
          r="1"
          variants={variants.dot1}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="1"
          variants={variants.dot2}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="19"
          r="1"
          variants={variants.dot3}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function EllipsisVertical(props: EllipsisVerticalProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  EllipsisVertical,
  EllipsisVertical as EllipsisVerticalIcon,
  type EllipsisVerticalProps,
  type EllipsisVerticalProps as EllipsisVerticalIconProps,
};
