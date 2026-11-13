import { LuLoaderCircle } from "react-icons/lu"
import type { IconBaseProps } from "react-icons"

import { cn } from "@/lib/utils"

function Spinner({ className, ...props }: IconBaseProps) {
  return (
    <LuLoaderCircle
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
