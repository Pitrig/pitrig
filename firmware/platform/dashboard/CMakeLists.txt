set(component_sources
    "widgets/lap_timer/src/lap_timer_widget.cpp"
    "widgets/lap_timer/font/simcore_timer_58_Bold_4.c")
set(component_include_dirs "widgets/lap_timer/include")
set(component_requirements esp_lvgl_port lap_timer performance)

if(SIMCORE_DEBUG)
  list(APPEND component_sources
       "widgets/performance_overlay/src/performance_overlay_widget.cpp")
  list(APPEND component_include_dirs
       "widgets/performance_overlay/include")
  list(APPEND component_requirements performance)
endif()

idf_component_register(
    SRCS ${component_sources}
    INCLUDE_DIRS ${component_include_dirs}
    REQUIRES ${component_requirements})

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)

if(SIMCORE_DEBUG)
  target_compile_definitions(${COMPONENT_LIB} PRIVATE SIMCORE_DEBUG)
endif()
