import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type LockKeyholeOpenProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    body: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    shackle: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "easeOut", delay: 0.3 },
      },
    },
    keyhole: {
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
        <motion.circle
          cx="12"
          cy="16"
          r="1"
          variants={variants.keyhole}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          width="18"
          height="12"
          x="3"
          y="10"
          rx="2"
          variants={variants.body}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M7 10V7a5 5 0 0 1 9.33-2.5"
          variants={variants.shackle}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function LockKeyholeOpen(props: LockKeyholeOpenProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  LockKeyholeOpen,
  LockKeyholeOpen as LockKeyholeOpenIcon,
  type LockKeyholeOpenProps,
  type LockKeyholeOpenProps as LockKeyholeOpenIconProps,
};
