import React, { createContext, useState, useContext } from 'react';

export const ChannelContext = createContext({
  current: null,
  setCurrent: (_channel) => {},
});

export function useChannel() {
  return useContext(ChannelContext);
}

export function ChannelProvider({ children }) {
  const [current, setCurrent] = useState(null);
  return (
    <ChannelContext.Provider value={{ current, setCurrent }}>
      {children}
    </ChannelContext.Provider>
  );
}
