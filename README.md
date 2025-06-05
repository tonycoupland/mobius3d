# mobius3d

This project is a python script to generate a STL file of a mobius strip designed to be printed with a 3D printer.

To modify the settings of the object produced, you can change the values at the bottom of the file

For example to produce a three sided smooth strip that twists through 1/3rd of a rotation as it completes, use the following

```
    sides = 3
    poly_radius = 8
    ring_radius = 30
    step_count = 360 # 360 segments around the ring will make a smooth transition
    twist = 120 # Rotate around 1/3rd of a rotation, i.e. one side
```

![alt text](https://github.com/tonycoupland/mobius3d/blob/master/examples/3side360step.jpg?raw=true)


Or to produce a six sided low poly strip that twists through 1/6th of a rotation as it completes, use the following

```
    sides = 6
    poly_radius = 8
    ring_radius = 30
    step_count = 24 # 24 segments will make a low poly style shape
    twist = 60 # Rotate around 1/6th of a rotation, i.e. one side
```

![alt text](https://github.com/tonycoupland/mobius3d/blob/main/examples/6side24step.jpg?raw=true)
