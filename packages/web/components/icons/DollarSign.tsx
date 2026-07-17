import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type DollarSignProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: { rotate: 0, scale: 1 },
      animate: { transition: { duration: 0.5 } },
    },
    line: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.5, ease: "easeInOut" },
      },
    },
    sPath: {
      initial: { pathLength: 1, opacity: 1 },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: { duration: 0.6, ease: "easeOut", delay: 0.3 },
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
        <motion.line
          x1="12"
          x2="12"
          y1="2"
          y2="22"
          variants={variants.line}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
          variants={variants.sPath}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function DollarSign(props: DollarSignProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  DollarSign,
  DollarSign as DollarSignIcon,
  type DollarSignProps,
  type DollarSignProps as DollarSignIconProps,
};
