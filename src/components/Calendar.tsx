import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  AlertTriangle,
  X,
  Edit2,
  Trash2,
  CheckCircle2,
  Timer,
  Target,
  ListTodo,
  Folder
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { auth } from '../lib/firebase';
import { User } from 'firebase/auth';
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  parseISO,
  isWithinInterval,
  addDays,
  isAfter,
  isBefore,
  startOfDay,
  endOfDay
} from 'date-fns';
import {
  onCollectionSnapshot,
  createEvent,
  updateEvent,
  deleteEvent
} from '../lib/calendar-firebase';

// Types
interface Event {
  id: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  type: 'event' | 'task' | 'goal' | 'project' | 'plan';
  status?: 'pending' | 'completed';
  color?: string;
  userId: string;
}

interface Task {
  id: string;
  task: string;
  dueDate: Date;
  status: 'pending' | 'completed';
  userId: string;
}

interface Goal {
  id: string;
  goal: string;
  dueDate: Date;
  status: 'pending' | 'completed';
  userId: string;
}

interface Project {
  id: string;
  project: string;
  dueDate: Date;
  status: 'pending' | 'completed';
  userId: string;
}

interface Plan {
  id: string;
  plan: string;
  dueDate: Date;
  status: 'pending' | 'completed';
  userId: string;
}

export function Calendar() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<Event[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    const stored = localStorage.getItem('isSidebarCollapsed');
    return stored ? JSON.parse(stored) : false;
  });

  // Event form state
  const [eventForm, setEventForm] = useState({
    title: '',
    description: '',
    startDate: new Date(),
    endDate: new Date(),
    type: 'event' as const,
    color: '#3B82F6' // Default blue
  });

  // Update localStorage whenever the sidebar state changes
  useEffect(() => {
    localStorage.setItem('isSidebarCollapsed', JSON.stringify(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  // Auth state listener
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Collection snapshots
  useEffect(() => {
    if (!user) return;
    
    const unsubEvents = onCollectionSnapshot('events', user.uid, (items) => 
      setEvents(items.map(item => ({
        id: item.id,
        ...item.data,
        startDate: item.data.startDate.toDate(),
        endDate: item.data.endDate.toDate()
      })))
    );
    
    const unsubTasks = onCollectionSnapshot('tasks', user.uid, (items) => 
      setTasks(items.map(item => ({
        id: item.id,
        ...item.data,
        dueDate: item.data.dueDate.toDate()
      })))
    );
    
    const unsubGoals = onCollectionSnapshot('goals', user.uid, (items) => 
      setGoals(items.map(item => ({
        id: item.id,
        ...item.data,
        dueDate: item.data.dueDate.toDate()
      })))
    );
    
    const unsubProjects = onCollectionSnapshot('projects', user.uid, (items) => 
      setProjects(items.map(item => ({
        id: item.id,
        ...item.data,
        dueDate: item.data.dueDate.toDate()
      })))
    );
    
    const unsubPlans = onCollectionSnapshot('plans', user.uid, (items) => 
      setPlans(items.map(item => ({
        id: item.id,
        ...item.data,
        dueDate: item.data.dueDate.toDate()
      })))
    );

    return () => {
      unsubEvents();
      unsubTasks();
      unsubGoals();
      unsubProjects();
      unsubPlans();
    };
  }, [user]);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1));
  };

  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setEventForm(prev => ({
      ...prev,
      startDate: date,
      endDate: addDays(date, 1)
    }));
    setShowEventModal(true);
  };

  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
    setEventForm({
      title: event.title,
      description: event.description || '',
      startDate: event.startDate,
      endDate: event.endDate,
      type: event.type,
      color: event.color || '#3B82F6'
    });
    setShowEventModal(true);
  };

  const handleCreateEvent = async () => {
    if (!user || !eventForm.title) return;

    try {
      if (selectedEvent) {
        await updateEvent(selectedEvent.id, {
          ...eventForm,
          userId: user.uid
        });
      } else {
        await createEvent({
          ...eventForm,
          userId: user.uid
        });
      }
      setShowEventModal(false);
      setSelectedEvent(null);
      setEventForm({
        title: '',
        description: '',
        startDate: new Date(),
        endDate: new Date(),
        type: 'event',
        color: '#3B82F6'
      });
    } catch (error) {
      console.error('Error saving event:', error);
    }
  };

  const handleDeleteEvent = async () => {
    if (!selectedEvent) return;

    try {
      await deleteEvent(selectedEvent.id);
      setShowEventModal(false);
      setSelectedEvent(null);
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  };

  // Get calendar days
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(currentDate),
    end: endOfWeek(currentDate)
  });

  // Get all items for a specific day
  const getDayItems = (date: Date) => {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);

    const dayEvents = events.filter(event => 
      isWithinInterval(dayStart, { start: event.startDate, end: event.endDate }) ||
      isWithinInterval(dayEnd, { start: event.startDate, end: event.endDate })
    );

    const dayTasks = tasks.filter(task => 
      isSameDay(task.dueDate, date)
    );

    const dayGoals = goals.filter(goal => 
      isSameDay(goal.dueDate, date)
    );

    const dayProjects = projects.filter(project => 
      isSameDay(project.dueDate, date)
    );

    const dayPlans = plans.filter(plan => 
      isSameDay(plan.dueDate, date)
    );

    return [
      ...dayEvents, 
      ...dayTasks.map(task => ({
        id: task.id,
        title: task.task,
        type: 'task' as const,
        startDate: task.dueDate,
        endDate: task.dueDate,
        status: task.status,
        color: '#EF4444' // Red for tasks
      })),
      ...dayGoals.map(goal => ({
        id: goal.id,
        title: goal.goal,
        type: 'goal' as const,
        startDate: goal.dueDate,
        endDate: goal.dueDate,
        status: goal.status,
        color: '#10B981' // Green for goals
      })),
      ...dayProjects.map(project => ({
        id: project.id,
        title: project.project,
        type: 'project' as const,
        startDate: project.dueDate,
        endDate: project.dueDate,
        status: project.status,
        color: '#6366F1' // Indigo for projects
      })),
      ...dayPlans.map(plan => ({
        id: plan.id,
        title: plan.plan,
        type: 'plan' as const,
        startDate: plan.dueDate,
        endDate: plan.dueDate,
        status: plan.status,
        color: '#8B5CF6' // Purple for plans
      }))
    ];
  };

  // Get type icon
  const getTypeIcon = (type: Event['type']) => {
    switch (type) {
      case 'task':
        return <ListTodo className="w-4 h-4" />;
      case 'goal':
        return <Target className="w-4 h-4" />;
      case 'project':
        return <Folder className="w-4 h-4" />;
      case 'plan':
        return <Timer className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  // Show loading state while checking auth
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
        <div className="animate-pulse">
          <p className="text-xl">Loading...</p>
          <div className="mt-4 h-2 w-32 bg-gray-700 rounded"></div>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    navigate('/login');
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-900">
      <Sidebar 
        isCollapsed={isSidebarCollapsed} 
        onToggle={handleToggleSidebar}
        userName={user.displayName || 'User'}
      />
      
      <main className={`flex-1 overflow-hidden transition-all duration-300 ${
        isSidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CalendarIcon className="w-6 h-6 text-blue-400" />
                <div>
                  <h1 className="text-xl font-semibold text-white">Calendar</h1>
                  <p className="text-sm text-gray-400">Manage your schedule and deadlines</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span>All times are in your local timezone</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedEvent(null);
                    setEventForm({
                      title: '',
                      description: '',
                      startDate: new Date(),
                      endDate: addDays(new Date(), 1),
                      type: 'event',
                      color: '#3B82F6'
                    });
                    setShowEventModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  New Event
                </button>
              </div>
            </div>
          </div>

          {/* Calendar Header */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold text-white">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setCurrentDate(new Date())}
                  className="px-3 py-1 text-sm text-gray-300 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  Today
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                <span className="text-sm text-gray-400">Tasks</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-sm text-gray-400">Goals</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-indigo-500 rounded-full"></span>
                <span className="text-sm text-gray-400">Projects</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-purple-500 rounded-full"></span>
                <span className="text-sm text-gray-400">Plans</span>
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="grid grid-cols-7 gap-4">
              {/* Day headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="text-sm font-medium text-gray-400 text-center">
                  {day}
                </div>
              ))}

              {/* Calendar days */}
              {calendarDays.map((day) => {
                const dayItems = getDayItems(day);
                const isToday = isSameDay(day, new Date());
                const isCurrentMonth = isSameMonth(day, currentDate);

                return (
                  <div
                    key={day.toISOString()}
                    onClick={() => handleDateClick(day)}
                    className={`min-h-[120px] p-2 rounded-lg border border-gray-800 transition-colors cursor-pointer
                      ${isCurrentMonth ? 'bg-gray-800/50' : 'bg-gray-800/20'}
                      ${isToday ? 'ring-2 ring-blue-500' : ''}
                      hover:bg-gray-800`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${
                        isCurrentMonth ? 'text-white' : 'text-gray-500'
                      }`}>
                        {format(day, 'd')}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="text-xs text-gray-400">
                          {dayItems.length} items
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEventClick(item);
                          }}
                          className={`w-full text-left px-2 py-1 rounded text-xs flex items-center gap-1.5
                            ${item.status === 'completed' ? 'line-through opacity-50' : ''}`}
                          style={{ backgroundColor: `${item.color}20`, color: item.color }}
                        >
                          {getTypeIcon(item.type)}
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Event Modal */}
        {showEventModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">
                  {selectedEvent ? 'Edit Event' : 'New Event'}
                </h3>
                <button
                  onClick={() => {
                    setShowEventModal(false);
                    setSelectedEvent(null);
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={eventForm.title}
                    onChange={(e) => setEventForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Event title"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={eventForm.description}
                    onChange={(e) => setEventForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Event description"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Start Date
                    </label>
                    <input
                      type="datetime-local"
                      value={format(eventForm.startDate, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => setEventForm(prev => ({ 
                        ...prev, 
                        startDate: parseISO(e.target.value)
                      }))}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      End Date
                    </label>
                    <input
                      type="datetime-local"
                      value={format(eventForm.endDate, "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => setEventForm(prev => ({ 
                        ...prev, 
                        endDate: parseISO(e.target.value)
                      }))}
                      className="w-full bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Color
                  </label>
                  <div className="flex gap-2">
                    {['#3B82F6', '#EF4444', '#10B981', '#6366F1', '#8B5CF6'].map((color) => (
                      <button
                        key={color}
                        onClick={() => setEventForm(prev => ({ ...prev, color }))}
                        className={`w-8 h-8 rounded-full transition-transform ${
                          eventForm.color === color ? 'ring-2 ring-white scale-110' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  {selectedEvent && (
                    <button
                      onClick={handleDeleteEvent}
                      className="px-4 py-2 text-red-300 bg-red-900/20 rounded-lg hover:bg-red-900/30 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowEventModal(false);
                      setSelectedEvent(null);
                    }}
                    className="px-4 py-2 text-gray-300 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateEvent}
                    disabled={!eventForm.title}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedEvent ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default Calendar;
