import { motion, type Variants } from "motion/react";

import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type XcircleProps = IconProps<keyof typeof animations>;

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
    leftDiagonal: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.3,
          ease: "easeOut",
          delay: 0.15,
        },
      },
    },
    rightDiagonal: {
      initial: {
        pathLength: 1,
        opacity: 1,
      },
      animate: {
        pathLength: [0, 1],
        opacity: [0, 1],
        transition: {
          duration: 0.3,
          ease: "easeOut",
          delay: 0.3,
        },
      },
    },
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({
  size = 24,
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
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
      role={ariaLabel ? "img" : "presentation"}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
    >
      <motion.g
        variants={variants.group}
        initial="initial"
        animate={controls}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <motion.path
          d="M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z"
          variants={variants.outerCircle}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m15 9-6 6"
          variants={variants.leftDiagonal}
          initial="initial"
          animate={controls}
        />
        <motion.path
          d="m9 9 6 6"
          variants={variants.rightDiagonal}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function Xcircle(props: XcircleProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Xcircle,
  Xcircle as XcircleIcon,
  type XcircleProps,
  type XcircleProps as XcircleIconProps,
};
