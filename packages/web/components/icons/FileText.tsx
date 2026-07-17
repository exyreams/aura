import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type FileTextProps = IconProps<keyof typeof animations>;

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
    line1: {
      initial: { scaleX: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        scaleX: [0.5, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.4 },
      },
    },
    line2: {
      initial: { scaleX: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        scaleX: [0.5, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.5 },
      },
    },
    line3: {
      initial: { scaleX: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        scaleX: [0.5, 1],
        transition: { duration: 0.3, ease: "easeOut", delay: 0.6 },
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
          d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
          variants={variants.file}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M14 2v4a2 2 0 0 0 2 2h4"
          variants={variants.fold}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M12 9H8"
          variants={variants.line1}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M16 13H8"
          variants={variants.line2}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M16 17H8"
          variants={variants.line3}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function FileText(props: FileTextProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  FileText,
  FileText as FileTextIcon,
  type FileTextProps,
  type FileTextProps as FileTextIconProps,
};
