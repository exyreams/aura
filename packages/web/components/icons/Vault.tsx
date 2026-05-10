import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type VaultProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    frame: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    dot1: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.1 },
      },
    },
    line1: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.15 },
      },
    },
    dot2: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.2 },
      },
    },
    line2: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.25 },
      },
    },
    dot3: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.3 },
      },
    },
    line3: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.35 },
      },
    },
    dot4: {
      initial: { scale: 1, opacity: 1 },
      animate: {
        scale: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.4 },
      },
    },
    line4: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.45 },
      },
    },
    center: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.5 },
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
          width="18"
          height="18"
          x="3"
          y="3"
          rx="2"
          variants={variants.frame}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="7.5"
          cy="7.5"
          r=".5"
          fill="currentColor"
          variants={variants.dot1}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m7.9 7.9 2.7 2.7"
          variants={variants.line1}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="16.5"
          cy="7.5"
          r=".5"
          fill="currentColor"
          variants={variants.dot2}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m13.4 10.6 2.7-2.7"
          variants={variants.line2}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="7.5"
          cy="16.5"
          r=".5"
          fill="currentColor"
          variants={variants.dot3}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m7.9 16.1 2.7-2.7"
          variants={variants.line3}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="16.5"
          cy="16.5"
          r=".5"
          fill="currentColor"
          variants={variants.dot4}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m13.4 13.4 2.7 2.7"
          variants={variants.line4}
          initial="initial"
          animate={controls}
        />
        <motion.circle
          cx="12"
          cy="12"
          r="2"
          variants={variants.center}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function Vault(props: VaultProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Vault,
  Vault as VaultIcon,
  type VaultProps,
  type VaultProps as VaultIconProps,
};
