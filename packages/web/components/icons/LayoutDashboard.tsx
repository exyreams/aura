import { motion, type Variants } from "motion/react";
import {
  type IconProps,
  IconWrapper,
  useAnimationWrapperContext,
  useVariants,
} from "./utils/AnimationWrapper";

type LayoutDashboardProps = IconProps<keyof typeof animations>;

const animations = {
  default: {
    group: {
      initial: {
        rotate: 0,
        scale: 1,
      },
      animate: {
        scale: [0.88, 1.04, 1],
        transition: {
          duration: 0.9,
          ease: [0.34, 1.56, 0.64, 1],
        },
      },
    },
    leftTop: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [5, 0],
        y: [-12, 0],
        transition: {
          duration: 0.55,
          ease: [0.34, 1.56, 0.64, 1],
        },
      },
    },
    rightTop: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [12, 0],
        y: [0, 0],
        transition: {
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.07,
        },
      },
    },
    rightBottom: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [-12, 0],
        y: [0, 0],
        transition: {
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.14,
        },
      },
    },
    leftBottom: {
      initial: {
        pathLength: 1,
        opacity: 1,
        x: 0,
        y: 0,
      },
      animate: {
        opacity: [0.3, 1],
        x: [7, 0],
        y: [12, 0],
        transition: {
          duration: 0.5,
          ease: [0.34, 1.56, 0.64, 1],
          delay: 0.21,
        },
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
          width="7"
          height="9"
          x="3"
          y="3"
          rx="1"
          variants={variants.leftTop}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          width="7"
          height="5"
          x="14"
          y="3"
          rx="1"
          variants={variants.rightTop}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          width="7"
          height="9"
          x="14"
          y="12"
          rx="1"
          variants={variants.rightBottom}
          initial="initial"
          animate={controls}
        />
        <motion.rect
          width="7"
          height="5"
          x="3"
          y="16"
          rx="1"
          variants={variants.leftBottom}
          initial="initial"
          animate={controls}
        />
      </motion.g>
    </motion.svg>
  );
}

function LayoutDashboard(props: LayoutDashboardProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  LayoutDashboard,
  LayoutDashboard as LayoutDashboardIcon,
  type LayoutDashboardProps,
  type LayoutDashboardProps as LayoutDashboardIconProps,
};
