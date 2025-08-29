import type { FC } from 'react';
import equicomLogo from '../assets/equicomLogo.png';
import basil from '../assets/FE.jpg';
import ProfilePage from '../screens/ProfilePage';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  activePage?: 'dashboard' | 'fieldEngineers' | 'activity';
}

const Header: FC<HeaderProps> = ({ activePage = 'dashboard' }) => {
  const navigate = useNavigate();

  const handleProfileClick = () => {
    navigate('/profile');
  }
  return (
    <div className="sticky top-0 z-10 px-4 py-3">
      <div className="bg-[#6b6f1d]/90 backdrop-blur-sm shadow-md rounded-full">
        <div className="flex items-center justify-between py-1 px-4">
          <img src={equicomLogo} alt="Equicom Logo" className="h-7" />
          
          {/* Navigation tabs */}
          <div className="tabs tabs-boxed bg-olive-600/30 p-1 rounded-full inline-flex">
            <a 
              href="/"
              className={`tab ${activePage === 'dashboard' ? 'tab-active bg-olive-700 text-white' : 'text-white/80'} rounded-full px-4 flex items-center`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-1">
                <path d="M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" />
              </svg>
              Dashboard
            </a>
            <a 
              href="/activity"
              className={`tab ${activePage === 'activity' ? 'tab-active bg-olive-700 text-white' : 'text-white/80'} rounded-full px-4 flex items-center`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-1">
                <path fillRule="evenodd" d="M6 4.75A.75.75 0 016.75 4h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 4.75zM6 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75A.75.75 0 016 10zm0 5.25a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H6.75a.75.75 0 01-.75-.75zM1.99 4.75a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01zM1.99 15.25a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1v-.01zM1.99 10a1 1 0 011-1H3a1 1 0 011 1v.01a1 1 0 01-1 1h-.01a1 1 0 01-1-1V10z" clipRule="evenodd" />
              </svg>
              Activity
            </a>
            
            <a 
              href="/field-engineers"
              className={`tab ${activePage === 'fieldEngineers' ? 'tab-active bg-olive-700 text-white' : 'text-white/80'} rounded-full px-4 flex items-center`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 mr-1">
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              Field Engineers
            </a>
           
            
          </div>

          {/* Profile avatar and name */}
          <div className="flex items-center p-2 cursor-pointer hover:bg-olive-700/30 rounded-full" onClick={handleProfileClick}>
            <div className="avatar mr-2">
              <div className="w-10 rounded-full">
                <img src={basil} alt="Profile"/>
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-semibold text-white/70">Basil</span>
              <span className="text-sm text-white/70">Admin</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;