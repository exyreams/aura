import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type FileLockProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    file: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    fold: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.3, ease: "easeInOut", delay: 0.3 },
      },
    },
    lockArch: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.4, ease: "easeOut", delay: 0.4 },
      },
    },
    lockBody: {
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
          d="M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3"
          variants={variants.file}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M14 2v5a1 1 0 0 0 1 1h5"
          variants={variants.fold}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M9 17v-2a2 2 0 0 0-4 0v2"
          variants={variants.lockArch}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          width="8"
          height="5"
          x="3"
          y="17"
          rx="1"
          variants={variants.lockBody}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function FileLock(props: FileLockProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileLock,
  FileLock as FileLockIcon,
  type FileLockProps,
  type FileLockProps as FileLockIconProps,
};
