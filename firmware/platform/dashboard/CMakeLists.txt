idf_component_register(
    SRCS "widgets/lap_timer/src/lap_timer_widget.cpp"
         "widgets/lap_timer/font/simcore_timer_58_Bold_4.c"
    INCLUDE_DIRS "widgets/lap_timer/include"
    REQUIRES esp_lvgl_port lap_timer)

target_compile_options(${COMPONENT_LIB} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-std=c++20>)
