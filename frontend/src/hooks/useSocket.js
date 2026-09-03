import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';

let socket = null;

export const useSocket = (events = {}) => {
  const token = useAuthStore(s => s.token);
  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    if (!token) return;

    if (!socket) {
      socket = io('/', {
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 5,
      });
    }

    const attached = Object.entries(handlersRef.current);
    attached.forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      attached.forEach(([event, handler]) => socket.off(event, handler));
    };
  }, [token]);

  return socket;
};
