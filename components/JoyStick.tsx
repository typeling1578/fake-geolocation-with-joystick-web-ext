import React, { useRef, useEffect, useCallback, useLayoutEffect } from "react";

interface JoystickProps {
  onMove?: (x: number, y: number) => void;
  size?: number;
  baseColor?: string;
  knobColor?: string;
  initialPosition?: { x: number; y: number };
}

const Joystick: React.FC<JoystickProps> = ({ onMove, size = 120, baseColor = "rgba(200, 200, 200, 0.5)", knobColor = "rgba(100, 100, 100, 0.8)",initialPosition }) => {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const isJoystickDragging = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isContainerDragging = useRef(false);
  const containerPos = useRef(initialPosition || { x: 20, y: window.innerHeight - size - 60 });
  const dragStartOffset = useRef({ x: 0, y: 0 });

  const handleJoystickMove = useCallback((clientX: number, clientY: number) => {
    if (!isJoystickDragging.current || !baseRef.current || !knobRef.current) return;

    const rect = baseRef.current.getBoundingClientRect();
    const maxRadius = rect.width / 2;
    const centerX = rect.left + maxRadius;
    const centerY = rect.top + maxRadius;

    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > maxRadius) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * maxRadius;
      dy = Math.sin(angle) * maxRadius;
    }

    knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;

    const normX = Number((dx / maxRadius).toFixed(2));
    const normY = Number((dy / maxRadius).toFixed(2)) * -1;

    if (onMove) onMove(normX, normY);
  }, [onMove]);

  const handleJoystickEnd = useCallback(() => {
    if (!isJoystickDragging.current || !knobRef.current) return;

    isJoystickDragging.current = false;
    knobRef.current.style.transition = "transform 0.2s ease-out";
    knobRef.current.style.transform = "translate(0px, 0px)";

    if (onMove) onMove(0, 0);

    setTimeout(() => {
      if (knobRef.current) knobRef.current.style.transition = "none";
    }, 200);
  }, [onMove]);

  const handleJoystickStart = (e: React.MouseEvent | React.TouchEvent) => {
    isJoystickDragging.current = true;
    if (knobRef.current) knobRef.current.style.transition = "none";
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    handleJoystickMove(clientX, clientY);
    e.stopPropagation();
  };

  const updateContainerPosition = (x: number, y: number) => {
    if (!containerRef.current) return;
    const newX = Math.min(Math.max(0, x), window.innerWidth - size);
    const newY = Math.min(Math.max(0, y), window.innerHeight - size);

    containerPos.current = { x: newX, y: newY };
    containerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
  };

  useEffect(() => {
    const handleResize = () => {
      updateContainerPosition(containerPos.current.x, containerPos.current.y);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useLayoutEffect(() => {
    updateContainerPosition(containerPos.current.x, containerPos.current.y);
  }, []);

  const handleContainerMove = useCallback((clientX: number, clientY: number) => {
    if (!isContainerDragging.current) return;

    const newX = clientX - dragStartOffset.current.x;
    const newY = clientY - dragStartOffset.current.y;
    updateContainerPosition(newX, newY);

  }, []);

  const handleHandleStart = (e: React.MouseEvent | React.TouchEvent) => {
    isContainerDragging.current = true;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

    dragStartOffset.current = {
      x: clientX - containerPos.current.x,
      y: clientY - containerPos.current.y
    };
    e.stopPropagation();
  };

  const handleContainerEnd = useCallback(() => {
    isContainerDragging.current = false;
  }, []);

  useEffect(() => {
    const handleWindowMove = (e: MouseEvent | TouchEvent) => {
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;

      if (isJoystickDragging.current) {
        handleJoystickMove(clientX, clientY);
      }
      if (isContainerDragging.current) {
        handleContainerMove(clientX, clientY);
      }
    };

    const handleWindowEnd = () => {
      handleJoystickEnd();
      handleContainerEnd();
    };

    window.addEventListener("mousemove", handleWindowMove);
    window.addEventListener("mouseup", handleWindowEnd);
    window.addEventListener("touchmove", handleWindowMove, { passive: false });
    window.addEventListener("touchend", handleWindowEnd);

    return () => {
      window.removeEventListener("mousemove", handleWindowMove);
      window.removeEventListener("mouseup", handleWindowEnd);
      window.removeEventListener("touchmove", handleWindowMove);
      window.removeEventListener("touchend", handleWindowEnd);
    };
  }, [handleJoystickMove, handleJoystickEnd, handleContainerMove, handleContainerEnd]);

  const styles: { [key: string]: React.CSSProperties } = {
    container: {
      position: "fixed",
      top: 0,
      left: 0,
      zIndex: 9999,
      touchAction: "none",
      userSelect: "none",
    },
    handle: {
      position: "absolute",
      top: -15,
      left: -15,
      width: 36,
      height: 36,
      backgroundColor: "#333",
      color: "#fff",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "move",
      fontSize: "20px",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      zIndex: 1,
    },
    base: {
      width: size,
      height: size,
      backgroundColor: baseColor,
      borderRadius: "50%",
      position: "relative",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backdropFilter: "blur(5px)",
      border: "2px solid rgba(255,255,255,0.1)"
    },
    knob: {
      width: size / 2,
      height: size / 2,
      backgroundColor: knobColor,
      borderRadius: "50%",
      cursor: "grab",
      position: "absolute",
      boxShadow: "inset 0 2px 4px rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.2)"
    }
  };

  return (
    <div ref={containerRef} style={styles.container}>
      <div style={styles.handle} onMouseDown={handleHandleStart} onTouchStart={handleHandleStart} title="Drag to move">
        ✥
      </div>
      <div ref={baseRef} style={styles.base} onMouseDown={handleJoystickStart} onTouchStart={handleJoystickStart}>
        <div ref={knobRef} style={styles.knob} />
      </div>
    </div>
  );
};

export default Joystick;