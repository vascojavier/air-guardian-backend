import { Stack } from 'expo-router';
import { UserProvider } from '../context/UserContext'; // corregí el path si lo moviste

export default function Layout() {
  return (
    <UserProvider>
      <Stack />
    </UserProvider>
  );
}
