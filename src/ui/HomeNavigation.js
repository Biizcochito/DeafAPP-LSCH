import {createContext,useContext} from 'react';

const HomeNavigationContext=createContext(null);
export function HomeNavigationProvider({onHome,children}) {
  return <HomeNavigationContext.Provider value={onHome}>{children}</HomeNavigationContext.Provider>;
}
export const useHomeNavigation=()=>useContext(HomeNavigationContext);
