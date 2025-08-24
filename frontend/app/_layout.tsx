// app/_layout.tsx
import { Stack } from 'expo-router';
import { UserProvider } from '../context/UserContext';

export default function Layout() {
  return (
    <UserProvider>
      <Stack />
    </UserProvider>
  );
}
